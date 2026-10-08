import {
	Copy,
	EyeOff,
	Link2,
	Maximize2,
	Pencil,
	Scissors,
	Trash2,
	Unlink,
	VolumeX,
} from "lucide-react";
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
	disabled?: boolean;
	linked?: boolean;
	locked?: boolean;
	canSeparate?: boolean;
}
export type TimelineMenuAction =
	| "duplicate"
	| "delete"
	| "edit"
	| "mute"
	| "fit"
	| "split"
	| "rename"
	| "disable"
	| "link"
	| "unlink"
	| "separate";
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
			disabled={target?.locked && action !== "fit"}
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
						{target?.kind === "clip" ||
						target?.kind === "annotation" ||
						target?.kind === "audio" ? (
							<>
								{target.canSeparate
									? item("separate", <Unlink size={14} />, t("context.separate"))
									: null}
								{item("rename", <Pencil size={14} />, t("context.rename"))}
								{target.kind !== "clip"
									? item(
											"disable",
											<EyeOff size={14} />,
											t(target.disabled ? "context.enable" : "context.disable"),
										)
									: null}
								{item(
									target.linked ? "unlink" : "link",
									target.linked ? <Unlink size={14} /> : <Link2 size={14} />,
									t(target.linked ? "context.unlink" : "context.link"),
								)}
							</>
						) : null}
						{item("duplicate", <Copy size={14} />, t("context.duplicate"))}
						{target?.kind === "clip"
							? item("split", <Scissors size={14} />, t("context.split"))
							: null}
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
