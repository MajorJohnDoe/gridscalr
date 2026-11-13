export type ShortcutDocument = "shortcuts" | "readme";

/** `[document, section, label, keys]` — see scripts/shortcut-catalogue.mjs. */
export type ShortcutRow = [ShortcutDocument, string, string, string[]];

export interface ShortcutData {
  tools?: Record<string, string>;
  actions?: Record<string, string>;
}

export interface ShortcutCheckInput {
  shortcuts: ShortcutData;
  shortcutsDoc: string;
  readme: string;
  rows: ShortcutRow[];
  unbound: string[];
}

export interface ShortcutCheckResult {
  problems: string[];
  checkedRows: number;
  checkedKeys: number;
}

export function parseShortcutSections(markdown: string): Map<string, Map<string, string>>;
export function parseShortcutTables(markdown: string): Map<string, string>;
export function codesIn(cell: string): string[];
export function checkShortcutDocumentation(input: ShortcutCheckInput): ShortcutCheckResult;
