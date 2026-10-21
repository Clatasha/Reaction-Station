import type { CreativeSettings } from "../../src/lib/ai-edition/creative/settings";

export const OVERLAY_WIDTH = 320;
export const OVERLAY_HEIGHT = 180;
const DIGITS = [
	[14, 17, 19, 21, 25, 17, 14],
	[4, 12, 4, 4, 4, 4, 14],
	[14, 17, 1, 2, 4, 8, 31],
	[30, 1, 1, 14, 1, 1, 30],
	[2, 6, 10, 18, 31, 2, 2],
	[31, 16, 16, 30, 1, 1, 30],
	[14, 16, 16, 30, 17, 17, 14],
	[31, 1, 2, 4, 8, 8, 8],
	[14, 17, 17, 14, 17, 17, 14],
	[14, 17, 17, 15, 1, 1, 14],
];
const random = (seed: number) => {
	const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
	return n - Math.floor(n);
};
/** Deterministic transparent RGBA, so scrubbing/export never generates different particles. */
export function overlayFrame(settings: CreativeSettings, frame: number): Buffer {
	const pixels = Buffer.alloc(OVERLAY_WIDTH * OVERLAY_HEIGHT * 4);
	const rgb = [1, 3, 5].map((start) => Number.parseInt(settings.color.slice(start, start + 2), 16));
	const paint = (x: number, y: number, alpha: number) => {
		x = Math.floor(x);
		y = Math.floor(y);
		if (x < 0 || y < 0 || x >= OVERLAY_WIDTH || y >= OVERLAY_HEIGHT) return;
		const offset = (y * OVERLAY_WIDTH + x) * 4;
		pixels[offset] = rgb[0];
		pixels[offset + 1] = rgb[1];
		pixels[offset + 2] = rgb[2];
		pixels[offset + 3] = Math.max(pixels[offset + 3], Math.round(255 * settings.opacity * alpha));
	};
	const phase = frame / 90;
	if (settings.overlay === "matrix") {
		const scale = Math.max(1, Math.round(settings.size));
		const columns = Math.ceil(OVERLAY_WIDTH / (8 * scale));
		for (let column = 0; column < columns; column++) {
			if (random(column + 9) > settings.density) continue;
			const y = (random(column + 1) * OVERLAY_HEIGHT + phase * OVERLAY_HEIGHT) % OVERLAY_HEIGHT;
			for (let tail = 0; tail < 8; tail++) {
				const digit = DIGITS[Math.floor(random(column * 31 + tail) * 10)];
				for (let row = 0; row < 7; row++)
					for (let bit = 0; bit < 5; bit++) {
						if (!(digit[row] & (1 << (4 - bit)))) continue;
						for (let dy = 0; dy < scale; dy++)
							for (let dx = 0; dx < scale; dx++)
								paint(
									column * 8 * scale + bit * scale + dx,
									((y - tail * 9 * scale + OVERLAY_HEIGHT * 2) % OVERLAY_HEIGHT) + row * scale + dy,
									1 - tail / 9,
								);
					}
			}
		}
	} else if (settings.overlay !== "none") {
		const count = Math.round(160 * settings.density);
		const soft = settings.overlay === "particles";
		for (let i = 0; i < count; i++) {
			const x = random(i + 7) * OVERLAY_WIDTH;
			const y = (random(i + 101) * OVERLAY_HEIGHT + phase * OVERLAY_HEIGHT) % OVERLAY_HEIGHT;
			const radius = settings.size * (soft ? 5 : 1.5);
			for (let dy = -Math.ceil(radius); dy <= radius; dy++)
				for (let dx = -Math.ceil(radius); dx <= radius; dx++) {
					const distance = Math.hypot(dx, dy) / radius;
					if (distance <= 1) paint(x + dx, y + dy, soft ? (1 - distance) ** 2 : 0.8);
				}
		}
	}
	return pixels;
}
