import type { ToolId } from "../state/store";
import data from "./shortcuts.json";

export const TOOL_SHORTCUTS = data.tools as Partial<Record<ToolId, string>>;
export const APP_SHORTCUTS = data.actions;

/** Keyboard-event key (lower case) to tool id. */
export const TOOL_KEYS: Record<string, ToolId> = Object.fromEntries(
  Object.entries(TOOL_SHORTCUTS)
    .filter(([, key]) => Boolean(key))
    .map(([id, key]) => [(key as string).toLowerCase(), id as ToolId]),
);

const isMac = /Mac|iPhone|iPad/i.test(
  typeof navigator === "undefined" ? "" : `${navigator.platform} ${navigator.userAgent}`,
);

/** Formats a portable shortcut for display on the current platform. */
export function formatShortcut(label: string): string {
  if (!isMac) return label;
  return label
    .replace(/Ctrl\+/g, "⌘")
    .replace(/Shift\+/g, "⇧")
    .replace(/Alt\+/g, "⌥")
    .replace(/⌘⇧/g, "⇧⌘");
}
