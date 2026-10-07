import fs from "node:fs/promises";
import path from "node:path";
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
	await dock.screenshot({ path: path.join(output, "recorder-dock.png") });
	await page.getByRole("button", { name: "Session controls", exact: true }).click();
	const panel = page.getByRole("tabpanel");
	await panel.waitFor();
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
	await dock.screenshot({ path: path.join(output, "vertical-dock.png") });
	if (errors.length) throw new Error(errors.join("\n"));
	console.log(
		"Packaged recorder UI smoke passed. Native capture and OS click-through require desktop testing.",
	);
} finally {
	await application.close();
}
