/**
 * Pure rules for the documented shortcut tables (F-100).
 *
 * `src/ui/shortcuts.json` is the single source for tool and action bindings.
 * Three documents quote them: `docs/shortcuts.md` (also the bundled in-app
 * reference) and the two shortcut tables in `README.md`. Before this gate only
 * the tool map was compared, so a renamed action key or a changed page, layer
 * or Markups row could leave the documentation describing a shortcut that no
 * longer exists.
 *
 * The rules pin both directions:
 *
 * - every binding in `shortcuts.json` is quoted in at least one catalogued row,
 *   so a new or renamed key cannot go undocumented;
 * - every documented row is catalogued with its expected binding, so a stale row
 *   fails instead of surviving review;
 * - every code a shortcut cell quotes is a current binding or a declared
 *   workspace-list code, so an old value left behind in prose fails too.
 *
 * The row list lives in `shortcut-catalogue.mjs`; the pure functions here are
 * covered by `tests/shortcutDocs.test.ts`.
 */

/** @typedef {"shortcuts" | "readme"} ShortcutDocument */
/** @typedef {[ShortcutDocument, string, string, string[]]} ShortcutRow */

const TABLE_HEADER = /^\|\s*Action\s*\|\s*Shortcut\s*\|/i;
const TABLE_SEPARATOR = /^\|[\s:|-]+\|$/;
const DUPLICATE = "\u0000duplicate";

function splitRow(line) {
  const cells = line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  if (cells.length !== 2 || !cells[0] || !cells[1]) return null;
  return cells;
}

/**
 * Parses `## Heading` sections and the two-column tables inside them. A
 * repeated label is kept with a marker so the check can report the ambiguity.
 *
 * @param {string} markdown
 * @returns {Map<string, Map<string, string>>} section name to label/shortcut cell
 */
export function parseShortcutSections(markdown) {
  const sections = new Map();
  let heading = "";
  let table = null;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      heading = match[1];
      table = null;
      continue;
    }
    if (!line.startsWith("|")) {
      table = null;
      continue;
    }
    if (TABLE_HEADER.test(line) || TABLE_SEPARATOR.test(line)) continue;
    const cells = splitRow(line);
    if (!cells) continue;
    if (!table) {
      table = sections.get(heading) ?? new Map();
      sections.set(heading, table);
    }
    const [label, cell] = cells;
    if (table.has(label)) table.set(`${label}${DUPLICATE}`, cell);
    else table.set(label, cell);
  }
  return sections;
}

/**
 * Parses every `| Action | Shortcut |` table in a document, ignoring other
 * tables such as the README screenshot grid.
 *
 * @param {string} markdown
 * @returns {Map<string, string>} label to shortcut cell
 */
export function parseShortcutTables(markdown) {
  const rows = new Map();
  let inTable = false;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (TABLE_HEADER.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    if (TABLE_SEPARATOR.test(line)) continue;
    const cells = splitRow(line);
    if (!cells) continue;
    const [label, cell] = cells;
    if (rows.has(label)) rows.set(`${label}${DUPLICATE}`, cell);
    else rows.set(label, cell);
  }
  return rows;
}

/** Shortcut codes quoted in a cell, in order of appearance. */
export function codesIn(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

/**
 * Validates the shortcut data file and both documents.
 *
 * @param {{ shortcuts: { tools?: Record<string, string>, actions?: Record<string, string> }, shortcutsDoc: string, readme: string, rows: ShortcutRow[], unbound: string[] }} input
 * @returns {{ problems: string[], checkedRows: number, checkedKeys: number }}
 */
export function checkShortcutDocumentation({ shortcuts, shortcutsDoc, readme, rows, unbound }) {
  const problems = [];
  const binding = new Map();
  for (const [map, entries] of [
    ["tools", shortcuts.tools ?? {}],
    ["actions", shortcuts.actions ?? {}],
  ]) {
    const seen = new Map();
    for (const [key, code] of Object.entries(entries)) {
      if (typeof code !== "string" || !code.trim()) {
        problems.push(`src/ui/shortcuts.json: ${map}.${key} has no shortcut`);
        continue;
      }
      if (binding.has(key)) {
        problems.push(`src/ui/shortcuts.json: ${key} is defined in both tools and actions`);
        continue;
      }
      const clash = seen.get(code.toLowerCase());
      if (clash) {
        problems.push(`src/ui/shortcuts.json: ${map}.${key} and ${map}.${clash} share ${code}`);
      }
      seen.set(code.toLowerCase(), key);
      binding.set(key, code);
    }
  }

  const sections = parseShortcutSections(shortcutsDoc);
  const readmeRows = parseShortcutTables(readme);
  const known = new Set([...binding.values(), ...unbound]);
  const cataloguedSections = new Map();
  const cataloguedReadme = new Set();
  const usedKeys = new Set();

  for (const [document, section, label, keys] of rows) {
    const cell = document === "readme" ? readmeRows.get(label) : sections.get(section)?.get(label);
    const where = document === "readme" ? "README.md" : `docs/shortcuts.md (${section})`;
    if (cell === undefined) {
      problems.push(`${where}: no row "${label}"; check scripts/shortcut-catalogue.mjs`);
      continue;
    }
    const codes = codesIn(cell);
    for (const key of keys) {
      usedKeys.add(key);
      const expected = binding.get(key);
      if (expected === undefined) {
        problems.push(`${where}: row "${label}" names unknown shortcut key ${key}`);
        continue;
      }
      if (!codes.includes(expected)) {
        const shown = codes.length ? codes.map((code) => `\`${code}\``).join(", ") : "no shortcut";
        problems.push(
          `${where}: row "${label}" must show \`${expected}\` for ${key}; it shows ${shown}`,
        );
      }
    }
    for (const code of codes) {
      if (!known.has(code)) {
        problems.push(
          `${where}: row "${label}" quotes \`${code}\`, which is not in src/ui/shortcuts.json`,
        );
      }
    }
    if (document === "readme") cataloguedReadme.add(label);
    else {
      if (!cataloguedSections.has(section)) cataloguedSections.set(section, new Set());
      cataloguedSections.get(section).add(label);
    }
  }

  for (const [section, table] of sections) {
    if (table.size === 0) continue;
    const pinned = cataloguedSections.get(section);
    if (!pinned) {
      problems.push(
        `docs/shortcuts.md: section "${section}" has a shortcut table but no catalogue rows`,
      );
      continue;
    }
    for (const label of table.keys()) {
      const duplicate = label.includes(DUPLICATE);
      const clean = label.replace(DUPLICATE, "");
      if (duplicate) {
        problems.push(`docs/shortcuts.md (${section}): row "${clean}" appears more than once`);
      } else if (!pinned.has(clean)) {
        problems.push(
          `docs/shortcuts.md (${section}): row "${clean}" is not in scripts/shortcut-catalogue.mjs`,
        );
      }
    }
  }

  for (const label of readmeRows.keys()) {
    const duplicate = label.includes(DUPLICATE);
    const clean = label.replace(DUPLICATE, "");
    if (duplicate) problems.push(`README.md: shortcut row "${clean}" appears more than once`);
    else if (!cataloguedReadme.has(clean)) {
      problems.push(`README.md: shortcut row "${clean}" is not in scripts/shortcut-catalogue.mjs`);
    }
  }

  for (const key of binding.keys()) {
    if (!usedKeys.has(key)) {
      problems.push(`src/ui/shortcuts.json: ${key} is not documented in any shortcut table`);
    }
  }

  return {
    problems: [...new Set(problems)].sort(),
    checkedRows: rows.length,
    checkedKeys: usedKeys.size,
  };
}
