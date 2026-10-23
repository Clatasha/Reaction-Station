// @vitest-environment jsdom
// The Regenerate button is a bare refresh icon beside a language list. While a transcription runs
// it is greyed, but it stays focusable and hoverable so its tooltip still opens: a natively
// disabled button takes neither, which is what `aria-disabled` is for.

import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transcription = vi.hoisted(() => ({
	status: "idle" as "idle" | "running",
	request: vi.fn(),
}));

vi.mock("@/lib/ai-edition/store/transcriptionStore", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/ai-edition/store/transcriptionStore")>();
	return {
		...actual,
		useAssetTranscriptions: () => ({
			"asset-1": { assetId: "asset-1", status: transcription.status },
		}),
		useTranscriptionStore: (select: (state: { request: unknown }) => unknown) =>
			select({ request: transcription.request }),
	};
});

// An echoing translator: the assertions read against keys, not prose that drifts with copy edits.
vi.mock("@/contexts/I18nContext", () => ({
	useI18n: () => ({ locale: "en", setLocale: vi.fn() }),
	useScopedT: () => (key: string) => key,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { assetSchema, createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { MediaStage } from "./MediaStage";

class StubResizeObserver {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", StubResizeObserver);
	transcription.status = "idle";
	transcription.request.mockClear();
	const document = createEmptyDocument({ projectId: "p", title: "t" });
	useProjectStore.setState({
		projectId: "p",
		document: {
			...document,
			assets: [assetSchema.parse({ id: "asset-1", label: "take", originalPath: "/rec/take.mp4" })],
		},
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	useProjectStore.setState({ document: null });
});

async function openDetail() {
	render(
		<TooltipProvider>
			<MediaStage onAddToTimeline={vi.fn(async () => undefined)} />
		</TooltipProvider>,
	);
	fireEvent.click(await screen.findByRole("button", { name: /take/ }));
	return screen.findByRole("button", { name: "mediaStage.regenerate" });
}

describe("MediaStage Regenerate button", () => {
	it("asks for a new transcription, and says what it redoes in its tooltip", async () => {
		const regenerate = await openDetail();
		expect(regenerate).not.toHaveAttribute("title");
		// A keyboard focus: one the mouse gave opens no tooltip.
		fireEvent.keyDown(window, { key: "Tab" });
		act(() => regenerate.focus());
		expect((await screen.findByRole("tooltip")).textContent).toBe("mediaStage.regenerateTip");
		fireEvent.click(regenerate);
		expect(transcription.request).toHaveBeenCalledWith("asset-1", "auto");
	});

	it("stays focusable and keeps its tooltip while a transcription runs, and fires nothing", async () => {
		transcription.status = "running";
		const regenerate = await openDetail();

		// Greyed and announced as disabled, but not natively disabled.
		expect(regenerate).toHaveAttribute("aria-disabled", "true");
		expect(regenerate).not.toBeDisabled();
		expect(regenerate).toHaveStyle({ opacity: "0.6", cursor: "not-allowed" });
		expect(regenerate.querySelector("svg")).toHaveClass("animate-spin");

		// A keyboard focus: one the mouse gave opens no tooltip.
		fireEvent.keyDown(window, { key: "Tab" });
		act(() => regenerate.focus());
		expect(regenerate).toHaveFocus();
		expect((await screen.findByRole("tooltip")).textContent).toBe("mediaStage.regenerateTip");

		fireEvent.click(regenerate);
		expect(transcription.request).not.toHaveBeenCalled();
	});
});

describe("MediaStage imports", () => {
	it("uses the all-media picker and imports an image and audio in order", async () => {
		const addAsset = vi.fn(async () =>
			assetSchema.parse({ id: "image", label: "photo.png", originalPath: "/photo.png" }),
		);
		const addAudioAsset = vi.fn(async () =>
			assetSchema.parse({
				id: "audio",
				kind: "audio",
				label: "voice.wav",
				originalPath: "/voice.wav",
			}),
		);
		useProjectStore.setState({ addAsset, addAudioAsset });
		const openLibraryFilePicker = vi.fn(async () => ({
			success: true,
			files: [
				{ name: "photo.png", path: "/photo.png" },
				{ name: "voice.wav", path: "/voice.wav" },
			],
		}));
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { openLibraryFilePicker },
		});
		render(<MediaStage onAddToTimeline={vi.fn(async () => undefined)} />);
		fireEvent.click(screen.getByRole("button", { name: "mediaStage.importMedia" }));
		await waitFor(() => expect(addAudioAsset).toHaveBeenCalledWith("/voice.wav", "voice.wav"));
		expect(openLibraryFilePicker).toHaveBeenCalledWith(false, true);
		expect(addAsset).toHaveBeenCalledWith("/photo.png", "photo.png");
	});
	it("accepts an external image drop in the Media tab", async () => {
		const addAsset = vi.fn(async () =>
			assetSchema.parse({ id: "image", label: "photo.png", originalPath: "/photo.png" }),
		);
		useProjectStore.setState({ addAsset });
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { getPathForFile: () => "/photo.png" },
		});
		const { container } = render(<MediaStage onAddToTimeline={vi.fn(async () => undefined)} />);
		fireEvent.drop(container.firstChild!, {
			dataTransfer: { files: [new File(["image"], "photo.png", { type: "image/png" })] },
		});
		await waitFor(() => expect(addAsset).toHaveBeenCalledWith("/photo.png", "photo.png"));
	});
});
