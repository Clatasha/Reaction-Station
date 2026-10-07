import { Copy, Maximize2, Pencil, Trash2, VolumeX } from "lucide-react";
import { useRef } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useScopedT } from "@/contexts/I18nContext";
import type { DuplicableTimelineKind } from "@/lib/ai-edition/document/duplicateTimelineItem";
import { moveMenuFocus } from "@/lib/menuKeyboard";
import styles from "./EditorShellV4.module.css";
export interface TimelineContextTarget {
	x: number;
	y: number;
	kind: DuplicableTimelineKind | "clip" | "empty";
	id: string;
	element?: HTMLElement;
	muted?: boolean;
}
export type TimelineMenuAction = "duplicate" | "delete" | "edit" | "mute" | "fit";
export function TimelineContextMenu({
	target,
	onClose,
	onAction,
}: {
	target: TimelineContextTarget | null;
	onClose: () => void;
	onAction: (action: TimelineMenuAction, target: TimelineContextTarget) => void;
}) {
	const t = useScopedT("timeline");
	const lastTarget = useRef(target);
	if (target) lastTarget.current = target;
	const anchor = useRef({ getBoundingClientRect: () => new DOMRect(0, 0, 0, 0) });
	anchor.current.getBoundingClientRect = () => new DOMRect(target?.x ?? 0, target?.y ?? 0, 0, 0);
	const item = (action: TimelineMenuAction, icon: React.ReactNode, label: string) => (
		<button
			type="button"
			role="menuitem"
			className={styles.appMenuRow}
			onClick={() => {
				// Exit animations can leave a menu button mounted after dismissal.
				// Dispatch with the item that opened the menu, before clearing it.
				const selected = target ?? lastTarget.current;
				if (selected) onAction(action, selected);
				onClose();
			}}
		>
			{icon}
			{label}
		</button>
	);
	return (
		<Popover
			open={!!target}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<PopoverAnchor virtualRef={anchor} />
			<PopoverContent
				align="start"
				side="bottom"
				sideOffset={0}
				className={styles.timelineContextMenu}
				role="menu"
				data-timeline-context-menu
				onContextMenu={(event) => event.stopPropagation()}
				aria-label={t("context.title")}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					lastTarget.current?.element?.focus();
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
					} else moveMenuFocus(event);
					event.nativeEvent.stopPropagation();
				}}
			>
				{target?.kind !== "empty" ? (
					<>
						{item("duplicate", <Copy size={14} />, t("context.duplicate"))}
						{target?.kind === "clip"
							? item("edit", <Pencil size={14} />, t("context.editClip"))
							: null}
						{target?.kind === "audio"
							? item(
									"mute",
									<VolumeX size={14} />,
									t(target.muted ? "context.unmute" : "context.mute"),
								)
							: null}
						{item("delete", <Trash2 size={14} />, t("context.delete"))}
						<div className={styles.appMenuSep} />
					</>
				) : null}
				{item("fit", <Maximize2 size={14} />, t("context.fit"))}
			</PopoverContent>
		</Popover>
	);
}
