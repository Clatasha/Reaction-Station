// Run against the exact vendored executable before the expensive native build.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";

const ffmpeg = path.resolve(process.argv[2]);
const directory = await fs.mkdtemp(path.resolve("release/proxy-runtime-"));
let service;
try {
	process.env.OPENSCREEN_FFMPEG_PATH = ffmpeg;
	const bundle = path.join(directory, "proxy.cjs");
	await build({
		entryPoints: ["electron/media/previewProxy.ts"],
		outfile: bundle,
		bundle: true,
		platform: "node",
		format: "cjs",
		packages: "external",
		logLevel: "silent",
	});
	const { PreviewProxyService } = createRequire(import.meta.url)(bundle);
	const source = path.join(directory, "fixture.webm");
	execFileSync(
		ffmpeg,
		[
			"-v",
			"error",
			"-f",
			"lavfi",
			"-i",
			"color=c=blue:s=160x90:r=15",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:sample_rate=48000",
			"-t",
			"2",
			"-c:v",
			"libvpx-vp9",
			"-deadline",
			"realtime",
			"-c:a",
			"libopus",
			source,
		],
		{ stdio: "pipe", timeout: 30000 },
	);
	service = new PreviewProxyService(path.join(directory, "cache"));
	const deadline = Date.now() + 60000;
	let status;
	do {
		status = await service.request(source, 2);
		if (status.state === "error") throw new Error(status.message);
		if (status.state === "ready") break;
		await new Promise((resolve) => setTimeout(resolve, 100));
	} while (Date.now() < deadline);
	assert.equal(status.state, "ready", "Proxy runtime preparation timed out");
	execFileSync(ffmpeg, ["-v", "error", "-i", status.path, "-f", "null", "-"], {
		stdio: "pipe",
		timeout: 30000,
	});
	console.log("Vendored FFmpeg proxy encode/decode passed using the production proxy service.");
} finally {
	service?.cancel();
	await fs.rm(directory, { recursive: true, force: true });
}
