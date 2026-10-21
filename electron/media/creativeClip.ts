import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	type CreativeSettings,
	type CreativeSource,
	creativeSettingsSchema,
} from "../../src/lib/ai-edition/creative/settings";
import { resolveFfmpeg } from "./audioPeaks";
import { OVERLAY_HEIGHT, OVERLAY_WIDTH, overlayFrame } from "./creativeOverlay";

export interface CreativeClipRequest {
	path: string;
	startSec: number;
	endSec: number;
	settings: CreativeSettings;
}
const VIDEO_ENCODING = [
	"-c:v",
	"mpeg4",
	"-q:v",
	"2",
	"-pix_fmt",
	"yuv420p",
	"-threads",
	"2",
	"-g",
	"30",
	"-bf",
	"0",
];
/** Disk-backed, bounded reverse chunks avoid buffering an entire recording in RAM. */
export class CreativeClipService {
	private child: ChildProcess | null = null;
	private busy = false;
	private cancelled = false;
	constructor(private directory: string) {}
	cancel() {
		this.cancelled = true;
		this.child?.kill();
	}
	private async run(ffmpeg: string, args: string[], frames?: CreativeSettings): Promise<void> {
		if (this.cancelled) throw new Error("Preparation cancelled");
		await new Promise<void>((resolve, reject) => {
			const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
				stdio: [frames ? "pipe" : "ignore", "ignore", "pipe"],
			});
			this.child = child;
			let stderr = "";
			const timer = setTimeout(() => child.kill(), 30 * 60 * 1000);
			child.stderr?.on("data", (data) => {
				stderr = (stderr + String(data)).slice(-8000);
			});
			child.once("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
			child.once("close", (code) => {
				clearTimeout(timer);
				if (this.child === child) this.child = null;
				if (code === 0 && !this.cancelled) resolve();
				else
					reject(
						new Error(
							this.cancelled
								? "Preparation cancelled"
								: `Creative clip preparation failed (${code}): ${stderr}`,
						),
					);
			});
			// EPIPE is reported by the process close handler with FFmpeg's useful error.
			child.stdin?.on("error", () => {
				/* Process close supplies FFmpeg diagnostics. */
			});
			if (frames)
				void (async () => {
					for (let frame = 0; frame < 90 && !this.cancelled; frame++) {
						await new Promise<void>((resolve, reject) => {
							child.stdin!.write(overlayFrame(frames, frame), (error) =>
								error ? reject(error) : resolve(),
							);
						});
					}
					child.stdin?.end();
				})().catch(() => child.kill());
		});
	}
	async prepare(request: CreativeClipRequest): Promise<CreativeSource> {
		if (this.busy) throw new Error("Another creative clip is being prepared");
		this.busy = true;
		this.cancelled = false;
		try {
			const result = await this.prepareOne(request);
			if (this.cancelled) throw new Error("Preparation cancelled");
			return result;
		} finally {
			this.busy = false;
		}
	}
	private async prepareOne(request: CreativeClipRequest): Promise<CreativeSource> {
		const settings = creativeSettingsSchema.parse(request.settings);
		const { startSec, endSec } = request;
		if (
			!Number.isFinite(startSec) ||
			!Number.isFinite(endSec) ||
			startSec < 0 ||
			endSec <= startSec
		)
			throw new Error("Invalid clip range");
		const ffmpeg = resolveFfmpeg();
		if (!ffmpeg) throw new Error("Bundled FFmpeg is unavailable");
		const stat = await fs.stat(request.path);
		const key = createHash("sha256")
			.update(
				JSON.stringify([
					"creative-v2",
					request.path,
					stat.size,
					stat.mtimeMs,
					startSec,
					endSec,
					settings,
				]),
			)
			.digest("hex");
		const output = path.join(this.directory, `${key}.mp4`);
		const result = { path: output, sourcePath: request.path, startSec, endSec, settings };
		try {
			await fs.access(output);
			return result;
		} catch {
			/* Generate once. */
		}
		const work = path.join(this.directory, randomUUID());
		try {
			await fs.mkdir(work, { recursive: true });
			const duration = endSec - startSec;
			let input = request.path;
			let offset = startSec;
			if (settings.reverse) {
				const pieces: string[] = [];
				// Read the chunks from the end, reverse each, then concatenate in that order.
				for (let end = endSec; end > startSec + 0.000001; ) {
					const begin = Math.max(startSec, end - 1);
					const file = path.join(work, `part-${pieces.length}.mp4`);
					await this.run(ffmpeg, [
						"-ss",
						String(begin),
						"-t",
						String(end - begin),
						"-i",
						request.path,
						"-an",
						"-vf",
						"reverse,setpts=PTS-STARTPTS",
						...VIDEO_ENCODING,
						file,
					]);
					pieces.push(file);
					end = begin;
				}
				const list = path.join(work, "concat.txt");
				await fs.writeFile(list, pieces.map((file) => `file '${path.basename(file)}'`).join("\n"));
				input = path.join(work, "reverse.mp4");
				offset = 0;
				await this.run(ffmpeg, ["-f", "concat", "-safe", "1", "-i", list, "-c", "copy", input]);
			}
			const args = ["-ss", String(offset), "-t", String(duration), "-i", input];
			const filters: string[] = [];
			if (settings.flipHorizontal) filters.push("hflip");
			if (settings.flipVertical) filters.push("vflip");
			let video = "[0:v]";
			let audioInput = 0;
			if (settings.overlay !== "none") {
				const overlay = path.join(work, "overlay.mov");
				await this.run(
					ffmpeg,
					[
						"-f",
						"rawvideo",
						"-pixel_format",
						"rgba",
						"-video_size",
						`${OVERLAY_WIDTH}x${OVERLAY_HEIGHT}`,
						"-framerate",
						"30",
						"-i",
						"pipe:0",
						"-an",
						"-c:v",
						"qtrle",
						overlay,
					],
					settings,
				);
				args.push("-stream_loop", "-1", "-i", overlay);
				// The expression scales to the reference video's visible dimensions, preserving alpha.
				filters.push("null");
				video = `[0:v]${filters.join(",")}[base];[1:v]setpts=PTS/${settings.speed}[effect];[effect][base]scale2ref[scaled][screen];[screen][scaled]overlay=shortest=1:format=auto`;
				audioInput = 2;
			} else {
				video += filters.length ? filters.join(",") : "null";
				audioInput = 1;
			}
			// Original audio keeps its clock/direction. Mic/camera and linked tracks remain independent.
			args.push("-ss", String(startSec), "-t", String(duration), "-i", request.path);
			video += ",setpts=PTS-STARTPTS[video]";
			const temporary = path.join(work, "finished.mp4");
			await this.run(ffmpeg, [
				...args,
				"-filter_complex_threads",
				"1",
				"-filter_complex",
				video,
				"-map",
				"[video]",
				"-map",
				`${audioInput}:a?`,
				"-af",
				"asetpts=PTS-STARTPTS",
				"-t",
				String(duration),
				"-output_ts_offset",
				String(startSec),
				...VIDEO_ENCODING,
				"-c:a",
				"aac",
				"-b:a",
				"320k",
				"-movflags",
				"+faststart",
				temporary,
			]);
			await fs.rename(temporary, output);
			return result;
		} finally {
			await fs.rm(work, { recursive: true, force: true });
		}
	}
}
