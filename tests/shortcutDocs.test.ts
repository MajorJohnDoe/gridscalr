import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DOC_ROWS, UNBOUND_CODES } from "../scripts/shortcut-catalogue.mjs";
import {
  checkShortcutDocumentation,
  codesIn,
  parseShortcutSections,
  parseShortcutTables,
} from "../scripts/shortcut-docs.mjs";

const root = resolve(__dirname, "..");

const shortcuts = {
  tools: { select: "V", pan: "H" },
  actions: { save: "Ctrl+S", redo: "Ctrl+Shift+Z", delete: "Delete" },
};

const shortcutsDoc = `# Keyboard shortcuts

## Tools

| Action | Shortcut |
| --- | --- |
| Select | \`V\` |
| Pan | \`H\` |

## Project and file

| Action | Shortcut |
| --- | --- |
| Save | \`Ctrl+S\` |
| Redo | \`Ctrl+Shift+Z\` or \`Ctrl+Y\` |
| Delete | \`Delete\` or \`Backspace\` |
`;

const readme = `# GridScalr

| Action | Shortcut |
| --- | --- |
| Save / save as | \`Ctrl+S\` |
| Delete | \`Delete\` |

## Screenshots

| Measure | Review |
| --- | --- |
| ![a](a.png) | \`not-a-shortcut\` |
`;

const rows = [
  ["shortcuts", "Tools", "Select", ["select"]],
  ["shortcuts", "Tools", "Pan", ["pan"]],
  ["shortcuts", "Project and file", "Save", ["save"]],
  ["shortcuts", "Project and file", "Redo", ["redo"]],
  ["shortcuts", "Project and file", "Delete", ["delete"]],
  ["readme", "README", "Save / save as", ["save"]],
  ["readme", "README", "Delete", ["delete"]],
] as const;

const unbound = ["Ctrl+Y", "Backspace"];

function check(overrides: Record<string, unknown> = {}) {
  return checkShortcutDocumentation({
    shortcuts,
    shortcutsDoc,
    readme,
    rows: rows as never,
    unbound,
    ...overrides,
  } as never);
}

describe("table parsing", () => {
  it("reads headings and their two-column tables", () => {
    const sections = parseShortcutSections(shortcutsDoc);
    expect([...sections.keys()]).toEqual(["Tools", "Project and file"]);
    expect(sections.get("Tools")?.get("Select")).toBe("`V`");
    expect(sections.get("Project and file")?.get("Redo")).toBe("`Ctrl+Shift+Z` or `Ctrl+Y`");
  });

  it("reads only Action/Shortcut tables and ignores other tables", () => {
    const parsed = parseShortcutTables(readme);
    expect([...parsed.keys()]).toEqual(["Save / save as", "Delete"]);
    expect(parsed.has("Measure")).toBe(false);
  });

  it("extracts the quoted codes, in order", () => {
    expect(codesIn("`Ctrl+Z` or `Ctrl+Y`")).toEqual(["Ctrl+Z", "Ctrl+Y"]);
    expect(codesIn("Arrow keys")).toEqual([]);
  });
});

describe("shortcut documentation check", () => {
  it("passes a consistent catalogue", () => {
    const result = check();
    expect(result.problems).toEqual([]);
    expect(result.checkedRows).toBe(rows.length);
    expect(result.checkedKeys).toBe(5);
  });

  it("fails when a binding is renamed in the data file but not the docs", () => {
    const result = check({
      shortcuts: {
        tools: { select: "V", pan: "H" },
        actions: { ...shortcuts.actions, save: "Ctrl+K" },
      },
    });
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('row "Save" must show `Ctrl+K` for save'),
        expect.stringContaining('README.md: row "Save / save as" must show `Ctrl+K` for save'),
      ]),
    );
  });

  it("fails a stale code left behind in the documentation", () => {
    const result = check({
      shortcutsDoc: shortcutsDoc.replace(
        "`Ctrl+Shift+Z` or `Ctrl+Y`",
        "`Ctrl+Shift+Z` or `Ctrl+J`",
      ),
    });
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.stringContaining("quotes `Ctrl+J`")]),
    );
  });

  it("fails a documented row that is not catalogued", () => {
    const result = check({
      shortcutsDoc: `${shortcutsDoc}| New row | \`Ctrl+N\` |\n`,
      shortcuts: { tools: shortcuts.tools, actions: { ...shortcuts.actions } },
    });
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.stringContaining('row "New row" is not in')]),
    );
  });

  it("fails a catalogue row that the documentation dropped", () => {
    const result = check({ shortcutsDoc: shortcutsDoc.replace(/\| Pan \| `H` \|\n/, "") });
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.stringContaining('docs/shortcuts.md (Tools): no row "Pan"')]),
    );
  });

  it("fails a binding that no table documents", () => {
    const result = check({
      shortcuts: {
        tools: { ...shortcuts.tools, arc: "Z" },
        actions: { ...shortcuts.actions },
      },
    });
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.stringContaining("arc is not documented")]),
    );
  });

  it("fails a section table without catalogue rows", () => {
    const result = check({
      shortcutsDoc: `${shortcutsDoc}\n## Help\n\n| Action | Shortcut |\n| --- | --- |\n| About | \`F1\` |\n`,
    });
    expect(result.problems).toEqual(
      expect.arrayContaining([expect.stringContaining('section "Help" has a shortcut table')]),
    );
  });

  it("fails duplicate bindings and duplicate rows", () => {
    const duplicateCode = check({
      shortcuts: { tools: { select: "V", pan: "V" }, actions: shortcuts.actions },
    });
    expect(duplicateCode.problems).toEqual(
      expect.arrayContaining([expect.stringContaining("share V")]),
    );

    const duplicateRow = check({
      shortcutsDoc: shortcutsDoc.replace("| Pan | `H` |", "| Pan | `H` |\n| Select | `V` |"),
    });
    expect(duplicateRow.problems).toEqual(
      expect.arrayContaining([expect.stringContaining("appears more than once")]),
    );
  });
});

describe("the shipped shortcut documentation", () => {
  it("matches src/ui/shortcuts.json", () => {
    const data = JSON.parse(readFileSync(resolve(root, "src/ui/shortcuts.json"), "utf8"));
    const result = checkShortcutDocumentation({
      shortcuts: data,
      shortcutsDoc: readFileSync(resolve(root, "docs/shortcuts.md"), "utf8"),
      readme: readFileSync(resolve(root, "README.md"), "utf8"),
      rows: DOC_ROWS as never,
      unbound: UNBOUND_CODES,
    });
    expect(result.problems).toEqual([]);
    expect(result.checkedKeys).toBe(
      Object.keys(data.tools).length + Object.keys(data.actions).length,
    );
  });
});
