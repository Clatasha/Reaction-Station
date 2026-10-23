import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { CropRegion } from "@/components/video-editor/types";
import { useScopedT } from "@/contexts/I18nContext";
import type { CreativeSettings } from "@/lib/ai-edition/creative/settings";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import {
	setActiveClip,
	setCompositorPlaying,
	setCompositorScene,
	setCompositorTime,
} from "@/native/compositorViewClient";
import { useNativeCompositorView } from "@/native/hooks/useNativeCompositorView";
import { buildSceneDescription } from "@/native/sceneDescription";

/** Unsaved, source-only native view. It never writes the document or editor transport. */
export function CreativeClipPreview({
	path,
	settings,
	crop,
	aspect,
	startSec,
	endSec,
	playing,
	timeSec,
	seekTimeSec,
	videoRef: _videoRef,
}: {
	path: string;
	settings: CreativeSettings;
	crop: CropRegion;
	aspect: number;
	startSec: number;
	endSec: number;
	playing: boolean;
	timeSec: number;
	seekTimeSec: number;
	videoRef: RefObject<HTMLVideoElement>;
}) {
	const t = useScopedT("settings");
	const canvas = useRef<HTMLCanvasElement>(null);
	const { viewId, error } = useNativeCompositorView(canvas, {
		sources: { screenPath: path },
		isolated: true,
	});
	const [pushError, setPushError] = useState("");
	const [initialized, setInitialized] = useState<number | null>(null);
	const time = useRef(timeSec);
	time.current = timeSec;
	const isPlaying = useRef(playing);
	isPlaying.current = playing;
	const end = useRef(endSec);
	end.current = endSec;
	const sceneJson = useMemo(() => {
		const doc = createEmptyDocument({ projectId: "clip-effect-preview", title: "Clip preview" });
		doc.assets = [
			{
				id: "source",
				kind: "video",
				originalPath: path,
				label: "Source",
				cameraTrack: null,
				video: { codec: "unknown", width: Math.round(aspect * 1080), height: 1080, fps: 30 },
				durationSec: endSec,
			},
		];
		doc.timeline.clips = [
			{
				id: "preview",
				assetId: "source",
				sourceStartSec: startSec,
				sourceEndSec: endSec,
				timelineStartSec: 0,
				timelineEndSec: endSec - startSec,
				origin: "user",
				reason: "",
				wordRefs: [],
				cropRegion: crop,
				creativeSettings: settings,
			},
		];
		doc.legacyEditor = {
			aspectRatio: "auto",
			padding: 0,
			frame: "none",
			shadowIntensity: 0,
			borderRadius: 0,
			webcamLayoutPreset: "no-webcam",
			cursorShow: false,
		};
		const scene = buildSceneDescription(doc);
		scene.cursor.show = false;
		return JSON.stringify(scene);
	}, [path, settings, crop, aspect, startSec, endSec]);
	// Initialize scene, source selection and transport in order. A fresh native
	// view defaults to playing; independent effects used to race the first seek.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scene/trim changes are handled below without reopening the source.
	useEffect(() => {
		if (viewId === null) return;
		let disposed = false;
		setInitialized(null);
		setPushError("");
		void (async () => {
			try {
				await setCompositorPlaying(viewId, false);
				if (disposed) return;
				await setCompositorScene(viewId, sceneJson);
				if (disposed) return;
				await setActiveClip(
					viewId,
					path,
					"",
					0,
					0,
					Math.max(startSec, Math.min(endSec - 0.001, time.current)),
				);
				if (!disposed) setInitialized(viewId);
			} catch (cause) {
				console.error("[clip-preview] Initialization failed:", cause);
				if (!disposed) setPushError(t("creative.previewFailed"));
			}
		})();
		return () => {
			disposed = true;
		};
		// Scene changes are applied separately so sliders never reopen the decoder.
	}, [viewId, path]);
	useEffect(() => {
		if (viewId === null || initialized !== viewId) return;
		let disposed = false;
		void setCompositorScene(viewId, sceneJson)
			.then(() =>
				disposed || isPlaying.current
					? undefined
					: setCompositorTime(viewId, Math.max(startSec, Math.min(endSec - 0.001, time.current))),
			)
			.catch((cause: unknown) => {
				console.error("[clip-preview] Scene update failed:", cause);
				if (!disposed) setPushError(t("creative.previewFailed"));
			});
		return () => {
			disposed = true;
		};
	}, [viewId, initialized, sceneJson, startSec, endSec, t]);
	useEffect(() => {
		if (viewId === null || initialized !== viewId) return;
		let disposed = false;
		void setCompositorTime(viewId, Math.max(startSec, Math.min(end.current - 0.001, seekTimeSec)))
			.then(() => (disposed ? undefined : setCompositorPlaying(viewId, playing)))
			.catch((cause: unknown) => {
				console.error("[clip-preview] Transport failed:", cause);
				if (!disposed) setPushError(t("creative.previewFailed"));
			});
		return () => {
			disposed = true;
			void setCompositorPlaying(viewId, false).catch(() => undefined);
		};
	}, [viewId, initialized, playing, seekTimeSec, startSec, t]);
	useEffect(() => {
		if (error) console.error("[clip-preview] Render failed:", error);
	}, [error]);
	const outputAspect = (aspect * crop.width) / crop.height;
	return (
		<div
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				display: "grid",
				placeItems: "center",
				background: "#000",
			}}
		>
			<canvas
				ref={canvas}
				data-testid="clip-effects-preview"
				aria-label={t("creative.livePreview")}
				style={{
					width: outputAspect >= aspect ? "100%" : "auto",
					height: outputAspect < aspect ? "100%" : "auto",
					maxWidth: "100%",
					maxHeight: "100%",
					aspectRatio: outputAspect,
				}}
			/>
			{error || pushError ? (
				<p role="alert" style={{ position: "absolute", padding: 12 }}>
					{t("creative.previewFailed")}
				</p>
			) : null}
		</div>
	);
}
