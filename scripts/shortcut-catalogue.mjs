/**
 * The documented shortcut rows, keyed by the table they live in.
 *
 * This catalogue is the contract between `src/ui/shortcuts.json` and the two
 * documents that list the bindings: `docs/shortcuts.md` (also the in-app
 * reference) and the shortcut tables in `README.md`. `check:docs` verifies it
 * with `scripts/shortcut-docs.mjs`.
 *
 * Each row is `[document, section, label, keys]`:
 *
 * - `document` is `"shortcuts"` for a heading section of `docs/shortcuts.md`
 *   or `"readme"` for a table with the header `| Action | Shortcut |`;
 * - `label` is the action cell, matched exactly;
 * - `keys` names the `tools` or `actions` entry whose binding must appear in
 *   the row. An empty list marks a row that documents a gesture, a modifier or
 *   a list-interaction key that `shortcuts.json` does not carry (see
 *   `UNBOUND_CODES`).
 *
 * Adding, renaming or removing a documented row needs a matching edit here.
 * That is deliberate: the tables are pinned, not just mentioned.
 *
 * @typedef {[import("./shortcut-docs.mjs").ShortcutDocument, string, string, string[]]} ShortcutRow
 */

/** @type {ShortcutRow[]} */
export const DOC_ROWS = [
  // Tools — every tool key in shortcuts.json.
  ["shortcuts", "Tools", "Select", ["select"]],
  ["shortcuts", "Tools", "Pan", ["pan"]],
  ["shortcuts", "Tools", "Calibrate", ["calibrate"]],
  ["shortcuts", "Tools", "Length", ["length"]],
  ["shortcuts", "Tools", "Area", ["area"]],
  ["shortcuts", "Tools", "Count", ["count"]],
  ["shortcuts", "Tools", "Radius", ["radius"]],
  ["shortcuts", "Tools", "Diameter", ["diameter"]],
  ["shortcuts", "Tools", "Arc", ["arc"]],
  ["shortcuts", "Tools", "Angle", ["angle"]],
  ["shortcuts", "Tools", "Slope", ["slope"]],
  ["shortcuts", "Tools", "Volume", ["volume"]],
  ["shortcuts", "Tools", "Pen", ["pen"]],
  ["shortcuts", "Tools", "Line", ["line"]],
  ["shortcuts", "Tools", "Arrow", ["arrow"]],
  ["shortcuts", "Tools", "Rectangle", ["rect"]],
  ["shortcuts", "Tools", "Ellipse", ["ellipse"]],
  ["shortcuts", "Tools", "Highlight", ["highlight"]],
  ["shortcuts", "Tools", "Text note", ["text"]],
  ["shortcuts", "Tools", "Text box", ["textbox"]],
  ["shortcuts", "Tools", "Pipe / duct", ["polyline"]],
  ["shortcuts", "Tools", "Revision cloud", ["cloud"]],
  ["shortcuts", "Tools", "Callout", ["callout"]],
  ["shortcuts", "Tools", "Stamp", ["stamp"]],
  ["shortcuts", "Tools", "Revision delta", ["delta"]],
  ["shortcuts", "Tools", "Symbol library", ["symbol"]],

  // Drawing and editing.
  ["shortcuts", "Drawing and editing", "Finish current shape", []],
  ["shortcuts", "Drawing and editing", "Cancel draft / clear selection / return to Select", []],
  ["shortcuts", "Drawing and editing", "Delete selection or remove the last point", ["delete"]],
  ["shortcuts", "Drawing and editing", "Add or remove markups from the selection", []],
  ["shortcuts", "Drawing and editing", "Nudge selected item", []],
  ["shortcuts", "Drawing and editing", "Nudge by 10 screen pixels", []],
  ["shortcuts", "Drawing and editing", "Rename selected markup", ["rename"]],
  ["shortcuts", "Drawing and editing", "Rename the project", ["rename"]],
  ["shortcuts", "Drawing and editing", "Edit selected text or measurement label", []],
  ["shortcuts", "Drawing and editing", "Copy / cut / paste markups", ["copy", "cut", "paste"]],
  ["shortcuts", "Drawing and editing", "Paste an image from the clipboard", ["paste"]],
  ["shortcuts", "Drawing and editing", "Duplicate selection", ["duplicate"]],
  ["shortcuts", "Drawing and editing", "Lock / unlock selection", []],
  ["shortcuts", "Drawing and editing", "Hide / show selection", []],

  // Pages panel.
  ["shortcuts", "Pages panel", "Open the page menu", []],
  ["shortcuts", "Pages panel", "Move focus between page cards", []],
  ["shortcuts", "Pages panel", "Select one page", []],
  ["shortcuts", "Pages panel", "Add or remove a page from the selection", []],
  ["shortcuts", "Pages panel", "Move the selected pages up / down", []],
  ["shortcuts", "Pages panel", "Move the selected pages to the start / end", []],
  ["shortcuts", "Pages panel", "Move the selected pages with the mouse", []],
  [
    "shortcuts",
    "Pages panel",
    "Insert a page before / after the current page",
    ["insertBefore", "insertAfter"],
  ],
  ["shortcuts", "Pages panel", "Move the current page to another position", ["movePage"]],
  ["shortcuts", "Pages panel", "Duplicate the current page with options", ["duplicatePage"]],
  ["shortcuts", "Pages panel", "Delete the current page", ["deletePage"]],
  ["shortcuts", "Pages panel", "Rename a page", []],

  // Layers panel.
  ["shortcuts", "Layers panel", "Open the layer menu", []],
  ["shortcuts", "Layers panel", "Move focus between layers", []],
  ["shortcuts", "Layers panel", "Rename the focused layer", ["rename"]],
  ["shortcuts", "Layers panel", "Make the focused layer the target layer", []],
  ["shortcuts", "Layers panel", "Open or close the focused group", []],
  ["shortcuts", "Layers panel", "Move the layer up / down among its siblings", []],
  ["shortcuts", "Layers panel", "Move the layer to the first / last sibling", []],
  ["shortcuts", "Layers panel", "Nest the focused layer under the layer above it", []],
  ["shortcuts", "Layers panel", "Move the focused layer out of its group", []],
  ["shortcuts", "Layers panel", "Move the layer with the mouse", []],
  ["shortcuts", "Layers panel", "Select a whole layer row", []],
  ["shortcuts", "Layers panel", "Add or remove an item from the selection", []],
  ["shortcuts", "Layers panel", "Select a range of items", []],

  // Markups panel.
  ["shortcuts", "Markups panel", "Open the panel", ["markups"]],
  ["shortcuts", "Markups panel", "Move focus between rows", []],
  ["shortcuts", "Markups panel", "Select one row", []],
  ["shortcuts", "Markups panel", "Add or remove a row from the selection", []],
  ["shortcuts", "Markups panel", "Open the row menu", []],
  ["shortcuts", "Markups panel", "Rename the focused markup", ["rename"]],
  ["shortcuts", "Markups panel", "Go to the focused markup", []],

  // View and navigation.
  ["shortcuts", "View and navigation", "Pan temporarily", []],
  ["shortcuts", "View and navigation", "Zoom", ["zoomIn", "zoomOut"]],
  ["shortcuts", "View and navigation", "Fit page", ["fitPage"]],
  ["shortcuts", "View and navigation", "Actual size", ["actualSize"]],
  ["shortcuts", "View and navigation", "Previous / next page", ["previousPage", "nextPage"]],
  ["shortcuts", "View and navigation", "Toggle left sidebar", ["sidebar"]],
  ["shortcuts", "View and navigation", "Toggle Properties panel", ["properties"]],
  ["shortcuts", "View and navigation", "Open Markups list", ["markups"]],
  ["shortcuts", "View and navigation", "Toggle reference view", ["splitView"]],
  ["shortcuts", "View and navigation", "Search drawing text", ["searchText"]],
  ["shortcuts", "View and navigation", "Open Quantities", ["quantities"]],

  // Project and file.
  ["shortcuts", "Project and file", "New project", ["newProject"]],
  ["shortcuts", "Project and file", "Open drawing", ["openDrawing"]],
  ["shortcuts", "Project and file", "Open project", ["openProject"]],
  ["shortcuts", "Project and file", "Save", ["save"]],
  ["shortcuts", "Project and file", "Save as", ["saveAs"]],
  ["shortcuts", "Project and file", "Export menu", ["exportMenu"]],
  ["shortcuts", "Project and file", "Project settings", ["settings"]],
  ["shortcuts", "Project and file", "Quit", ["quit"]],
  ["shortcuts", "Project and file", "Undo", ["undo"]],
  ["shortcuts", "Project and file", "Redo", ["redo"]],

  // Help.
  ["shortcuts", "Help", "Workflows", []],
  ["shortcuts", "Help", "User guide", ["userGuide"]],
  ["shortcuts", "Help", "Keyboard shortcuts", ["shortcuts"]],
  ["shortcuts", "Help", "About GridScalr", []],

  // README shortcut table.
  ["readme", "README", "Select / pan / calibrate", ["select", "pan", "calibrate"]],
  ["readme", "README", "Length / area / count", ["length", "area", "count"]],
  ["readme", "README", "Symbol library", ["symbol"]],
  ["readme", "README", "Undo / redo", ["undo", "redo"]],
  ["readme", "README", "Fit page / actual size", ["fitPage", "actualSize"]],
  ["readme", "README", "Save / save as", ["save", "saveAs"]],
  ["readme", "README", "Markups list", ["markups"]],
  ["readme", "README", "Quantities", ["quantities"]],

  // README list-interaction table (the Pages, Layers and Markups model).
  ["readme", "README", "Focus and move through rows", []],
  ["readme", "README", "Add a row to the selection or select a range", []],
  ["readme", "README", "Open the row menu", []],
  ["readme", "README", "Rename the focused row", []],
  ["readme", "README", "Move a page or layer among its siblings", []],
  ["readme", "README", "Move it to the first / last sibling", []],
  ["readme", "README", "Nest a layer under the layer above / move it out of its group", []],
  ["readme", "README", "Open or close the focused group", []],
  [
    "readme",
    "README",
    "Insert a page before / after the current page",
    ["insertBefore", "insertAfter"],
  ],
  ["readme", "README", "Move the current page to another position", ["movePage"]],
  ["readme", "README", "Duplicate the current page", ["duplicatePage"]],
  ["readme", "README", "Delete the current page", ["deletePage"]],
];

/**
 * Codes a documented row may quote without a `shortcuts.json` entry.
 *
 * They are real bindings owned by the workspace list controller
 * (`src/features/listInteraction`), a second hard-coded alias (`Ctrl+Y` for
 * redo), modifier gestures, or menu paths. The gate pins their documented text;
 * a change to the controller needs a matching catalogue edit. F-112 records the
 * missing machine-readable source.
 */
export const UNBOUND_CODES = [
  "Alt+Down",
  "Alt+End",
  "Alt+Home",
  "Alt+Left",
  "Alt+Right",
  "Alt+Up",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Cmd",
  "Ctrl",
  "Ctrl+Y",
  "End",
  "Enter",
  "Esc",
  "Home",
  "Menu key",
  "Shift",
  "Shift+F10",
  "Space",
  "Tab",
  "+",
  "-",
  "Help → Workflows",
  "Help → About GridScalr",
];
