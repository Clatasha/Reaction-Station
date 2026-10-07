import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const executablePath = path.resolve(process.argv[2]);
const output = path.resolve("release/recorder-preview");
await fs.mkdir(output, { recursive: true });
const application = await electron.launch({
	executablePath,
	env: { ...process.env, OPENSCREEN_DISABLE_CONTENT_PROTECTION: "1" },
	timeout: 60_000,
});
try {
	const page = await application.firstWindow();
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const dock = page.locator("[data-tray-layout]");
	await dock.waitFor({ timeout: 60_000 });
	await page.getByRole("button", { name: "Session controls", exact: true }).waitFor();
	await expect
		.poll(() =>
			application.evaluate(({ globalShortcut }) =>
				globalShortcut.isRegistered("CommandOrControl+Shift+S"),
			),
		)
		.toBe(true);
	const checkCloseInsideDock = async () => {
		const surface = await dock.boundingBox();
		const close = await page
			.getByRole("button", { name: "Quit Reaction Station", exact: true })
			.boundingBox();
		if (
			!surface ||
			!close ||
			close.x < surface.x ||
			close.y < surface.y ||
			close.x + close.width > surface.x + surface.width + 1 ||
			close.y + close.height > surface.y + surface.height + 1
		)
			throw new Error("Recorder Close is outside the dock");
	};
	await checkCloseInsideDock();
	await page.getByTestId("launch-system-audio-button").click();
	await dock.screenshot({ path: path.join(output, "recorder-dock.png") });
	await page.getByRole("button", { name: "Session controls", exact: true }).click();
	const panel = page.getByRole("tabpanel");
	await panel.waitFor();
	const volume = page.getByRole("slider", { name: "System audio volume", exact: true });
	await expect(volume).toBeEnabled();
	for (let step = 0; step < 40; step += 1) await volume.press("ArrowLeft");
	await expect(volume).toHaveValue("60");
	await page
		.locator("[data-hud-interactive='true']")
		.filter({ has: page.getByRole("tablist") })
		.screenshot({ path: path.join(output, "audio-mixer.png") });
	await page.getByRole("tab", { name: "Hotkeys", exact: true }).click();
	if ((await panel.getByRole("combobox").count()) !== 8)
		throw new Error("Missing configurable hotkey controls");
	await page
		.locator("[data-hud-interactive='true']")
		.filter({ has: page.getByRole("tablist") })
		.screenshot({ path: path.join(output, "recording-hotkeys.png") });
	await page.getByRole("button", { name: "Close", exact: true }).click();
	await page.getByRole("button", { name: "Switch to vertical bar", exact: true }).click();
	await page.locator("[data-tray-layout='vertical']").waitFor();
	await expect.poll(async () => (await dock.boundingBox())?.width ?? 1000).toBeLessThan(100);
	await checkCloseInsideDock();
	await dock.screenshot({ path: path.join(output, "vertical-dock.png") });
	if (errors.length) throw new Error(errors.join("\n"));
	const recordings = await application.evaluate(
		({ app }) => `${app.getPath("userData")}/recordings`,
	);
	await fs.mkdir(recordings, { recursive: true });
	const fixture = path.join(recordings, `reaction-audio-smoke-${Date.now()}.webm`);
	const ffmpeg = path.resolve("electron/native/bin/win32-x64/ffmpeg.exe");
	execFileSync(
		ffmpeg,
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			"color=c=0x242035:s=160x90:r=15",
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
			fixture,
		],
		{ stdio: "pipe" },
	);
	const audioSources = [];
	for (const [source, frequency] of [
		["microphone", 440],
		["desktop", 880],
	]) {
		const target = `${fixture}.${source}.wav`;
		execFileSync(
			ffmpeg,
			[
				"-y",
				"-f",
				"lavfi",
				"-i",
				`sine=frequency=${frequency}:sample_rate=48000`,
				"-t",
				"2",
				"-ac",
				"2",
				"-c:a",
				"pcm_s16le",
				target,
			],
			{ stdio: "pipe" },
		);
		audioSources.push({ path: target, source });
	}
	await page.evaluate(
		async ({ fixture, audioSources }) => {
			await window.electronAPI.setCurrentRecordingSession({
				screenVideoPath: fixture,
				audioSources,
				createdAt: Date.now(),
				cursorCaptureMode: "system",
			});
		},
		{ fixture, audioSources },
	);
	const editorWindow = application.waitForEvent("window");
	await page.getByTestId("launch-open-studio-button").click();
	const editor = await editorWindow;
	await editor.getByText("Microphone", { exact: true }).last().waitFor({ timeout: 60_000 });
	await editor.getByText("Desktop audio", { exact: true }).last().waitFor({ timeout: 60_000 });
	const getImportedDocument = () =>
		editor.evaluate(async () => {
			const list = await window.electronAPI.invokeNativeBridge({
				domain: "aiEdition",
				action: "document.listProjects",
				requestId: crypto.randomUUID(),
			});
			if (!list.ok || !list.data?.length) return null;
			const result = await window.electronAPI.invokeNativeBridge({
				domain: "aiEdition",
				action: "document.get",
				payload: { projectId: list.data[0].id },
				requestId: crypto.randomUUID(),
			});
			return result.ok ? result.data?.document : null;
		});
	await expect.poll(async () => (await getImportedDocument())?.audioTracks?.length ?? 0).toBe(2);
	const document = await getImportedDocument();
	if (!document.assets.find((asset) => asset.kind === "video")?.sourceAudioMuted)
		throw new Error("Embedded recording mix was not suppressed");
	if (
		!document.audioTracks.every(
			(track) => track.startMs === 0 && track.endMs === 2000 && track.gainDb === 0,
		)
	)
		throw new Error("Separate recording sources did not share the capture clock");
	await editor.getByText("Microphone", { exact: true }).last().click();
	await editor.getByRole("slider").first().waitFor();
	await editor.screenshot({ path: path.join(output, "separate-audio-editor.png") });
	await editor.getByRole("button", { name: "Workspace", exact: true }).click();
	const snapping = editor.getByRole("switch", { name: /Enable snapping/ });
	await expect(snapping).toHaveAttribute("aria-checked", "true");
	await snapping.click();
	await expect(snapping).toHaveAttribute("aria-checked", "false");
	await snapping.click();
	await editor.screenshot({ path: path.join(output, "workspace-menu.png") });
	await editor.keyboard.press("Escape");
	const microphone = editor
		.locator('[data-timeline-kind="audio"]')
		.filter({ hasText: "Microphone" })
		.first();
	await microphone.click({ button: "right" });
	await editor.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
	await expect.poll(async () => (await getImportedDocument()).audioTracks.length).toBe(3);
	const copied = (await getImportedDocument()).audioTracks.find(
		(track) => !document.audioTracks.some((original) => original.id === track.id),
	);
	const copiedId = copied.trackId ?? copied.id;
	await editor
		.locator(`[data-timeline-kind="audio"][data-timeline-id="${copiedId}"]`)
		.click({ button: "right" });
	await editor.screenshot({ path: path.join(output, "timeline-context-menu.png") });
	await editor.getByRole("menuitem", { name: "Delete", exact: true }).click();
	await expect.poll(async () => (await getImportedDocument()).audioTracks.length).toBe(2);

	console.log(
		"Packaged editor imported and persisted both synchronized audio sources with the fallback mix suppressed.",
	);
	await expect
		.poll(() =>
			application.evaluate(({ globalShortcut }) =>
				globalShortcut.isRegistered("CommandOrControl+Shift+S"),
			),
		)
		.toBe(false);
	console.log(
		"Packaged recorder UI smoke passed. Native capture and OS click-through require desktop testing.",
	);
} finally {
	await application.close();
}
