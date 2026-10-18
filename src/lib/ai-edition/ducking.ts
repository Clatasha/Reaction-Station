import type { AxcutAudioTrack } from "./schema";
export const DEFAULT_DUCKING = {
	enabled: true,
	depthDb: -10,
	thresholdDbfs: -35,
	attackSec: 0.25,
	holdSec: 0.5,
	releaseSec: 0.6,
};
export type DuckingSettings = typeof DEFAULT_DUCKING;
export function trackDucking(
	track: Pick<AxcutAudioTrack, "kind" | "recordingSource" | "ducking">,
): DuckingSettings {
	return { ...DEFAULT_DUCKING, enabled: track.kind === "music", ...track.ducking };
}
export function advanceDuckDb(
	current: number,
	sinceVoice: number,
	elapsed: number,
	config: DuckingSettings,
) {
	if (!config.enabled) return 0;
	const from = Math.min(0, Math.max(config.depthDb, current));
	return sinceVoice <= config.holdSec
		? Math.max(config.depthDb, from + (config.depthDb / Math.max(0.01, config.attackSec)) * elapsed)
		: Math.min(0, from - (config.depthDb / Math.max(0.01, config.releaseSec)) * elapsed);
}
