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
	await dock.screenshot({ path: path.join(output, "vertical-dock.png") });
	if (errors.length) throw new Error(errors.join("\n"));
	const editorWindow = application.waitForEvent("window");
	await page.getByTestId("launch-open-studio-button").click();
	await editorWindow;
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
