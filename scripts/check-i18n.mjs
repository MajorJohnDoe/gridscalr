import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IntlMessageFormat } from "intl-messageformat";
import { TYPES_RELATIVE, renderTypes } from "./i18n-types.mjs";

/**
 * Guards the i18n migration and the catalog contract:
 *
 *   node scripts/check-i18n.mjs            validate catalogs, types and literals
 *   node scripts/check-i18n.mjs --update   regenerate the hard-coded baseline
 *
 * Existing hard-coded UI prose is frozen in src/i18n/hardcoded-baseline.json,
 * and any new string literal that looks like interface text must go through the
 * message catalog instead.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanDirs = ["src"];
const baselinePath = resolve(root, "src/i18n/hardcoded-baseline.json");
const localeDir = resolve(root, "src/i18n/locales");
const typesPath = resolve(root, TYPES_RELATIVE);
const update = process.argv.includes("--update");

const STRING_LITERAL = /(["'])((?:\\.|(?!\1)[^\\])*)\1/g;
const TEMPLATE_LITERAL = /`((?:\\.|[^`\\])*)`/g;
const UI_PROPERTY =
  /\.(?:textContent|innerText|placeholder|title)\s*=\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/g;
const UI_ATTRIBUTE =
  /setAttribute\(\s*(["'])(?:aria-label|title|placeholder)\1\s*,\s*(["'])((?:\\.|(?!\2)[^\\])*)\2/g;
const EL_TEXT = /el\(\s*"[a-z0-9]+"\s*,\s*"[^"]*"\s*,\s*"((?:\\.|[^"\\])*)"/g;
const OPTION_TEXT = /option\(\s*"[^"]*"\s*,\s*"((?:\\.|[^"\\])*)"/g;
const PLACEHOLDER = /\{\s*([A-Za-z_][\w]*)\s*(?:[,}])/g;
/** Brand and symbol names that are intentionally not translated. */
const UI_ALLOWLIST = new Set(["GridScalr", "pt"]);
/**
 * Technical detail that is deliberately English: diagnostics reports, package
 * manifest validation, the Markdown renderer, XLSX XML and developer-only
 * geometry errors.
 */
const TEMPLATE_EXCLUDE_FILES = new Set([
  "src/features/diagnostics/model.ts",
  "src/features/projectPackage/model.ts",
  "src/help/markdown.ts",
  "src/model/symbolPaths.ts",
  "src/model/symbols/signCatalog.ts",
  "src/report/xlsx.ts",
]);
const TEMPLATE_ALLOW = [/^GridScalr\b/, /^[XYZ]\s/, /^[A-Z]{1,3}$/];

/** Removes ${…} expressions, including nested braces, before prose detection. */
function stripTemplateExpressions(text) {
  let result = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (depth === 0 && char === "$" && text[index + 1] === "{") {
      depth = 1;
      index += 1;
      continue;
    }
    if (depth > 0) {
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      continue;
    }
    result += char;
  }
  return result;
}

function isCandidate(text) {
  if (text.length < 4 || !text.includes(" ")) return false;
  if (!/^[A-ZÅÄÖ]/.test(text)) return false;
  if (text.includes("${") || text.includes("\\n")) return false;
  if (/^https?:|^\/|^[.#]/.test(text)) return false;
  // Symbol artwork is SVG path data, not interface prose.
  if (/^[MLHVCSQTAZmlhvcsqtaz][MLHVCSQTAZmlhvcsqtaz0-9\s.,+-]*$/.test(text)) return false;
  return true;
}

/** Template literals carry interpolated UI prose that the quote scan cannot see. */
function isTemplateCandidate(text, file) {
  if (TEMPLATE_EXCLUDE_FILES.has(file)) return false;
  // Only prose outside ${…} and HTML tags is interface text.
  const prose = stripTemplateExpressions(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!prose.includes(" ") || !/[A-Za-zÅÄÖåäö]/.test(prose)) return false;
  if (!/[A-ZÅÄÖ][a-zåäö]/.test(prose)) return false;
  if (/^[MLHVCSQTAZmlhvcsqtaz]/.test(prose)) return false;
  if (TEMPLATE_ALLOW.some((pattern) => pattern.test(prose))) return false;
  return true;
}

/**
 * Single-word labels ("Cancel", "Locked", "Auto") are easy to miss because the
 * prose scan requires a space. Only scan the properties where UI text lands.
 */
function isUiAssignmentCandidate(text) {
  if (isCandidate(text)) return false;
  if (!text || UI_ALLOWLIST.has(text)) return false;
  const letters = [...text].filter((char) => /[A-Za-zÅÄÖåäö]/.test(char)).length;
  return letters >= 2;
}

/** Text passed directly to `el()` and `option()` misses the property scan. */
function isElementTextCandidate(text) {
  if (!text || UI_ALLOWLIST.has(text)) return false;
  const letters = [...text].filter((char) => /[A-Za-zÅÄÖåäö]/.test(char)).length;
  return letters >= 2;
}

function placeholders(value) {
  const names = new Set();
  for (const match of value.matchAll(PLACEHOLDER)) names.add(match[1]);
  return [...names].sort();
}

/** JSON.parse keeps the last duplicate silently, which hides copy/paste mistakes. */
function duplicateKeys(raw) {
  const seen = new Set();
  const duplicates = [];
  for (const line of raw.split("\n")) {
    const match = /^\s{2}"([^"]+)"\s*:/.exec(line);
    if (!match) continue;
    if (seen.has(match[1])) duplicates.push(match[1]);
    seen.add(match[1]);
  }
  return duplicates;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

async function collect(directory) {
  const hits = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "i18n") continue;
      hits.push(...(await collect(path)));
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const rawSource = await readFile(path, "utf8");
    const source = stripComments(rawSource);
    const file = relative(root, path).split("\\").join("/");
    let match;
    STRING_LITERAL.lastIndex = 0;
    while ((match = STRING_LITERAL.exec(source))) {
      const value = match[2];
      if (!isCandidate(value)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      hits.push({ file, value, line });
    }

    for (const [pattern, valueGroup] of [
      [UI_PROPERTY, 2],
      [UI_ATTRIBUTE, 3],
    ]) {
      pattern.lastIndex = 0;
      let uiMatch;
      while ((uiMatch = pattern.exec(source))) {
        const value = uiMatch[valueGroup];
        if (!isUiAssignmentCandidate(value)) continue;
        const line = source.slice(0, uiMatch.index).split("\n").length;
        hits.push({ file, value, line });
      }
    }

    for (const pattern of [EL_TEXT, OPTION_TEXT]) {
      pattern.lastIndex = 0;
      let textMatch;
      while ((textMatch = pattern.exec(source))) {
        const value = textMatch[1];
        if (!isElementTextCandidate(value)) continue;
        const line = source.slice(0, textMatch.index).split("\n").length;
        hits.push({ file, value, line });
      }
    }

    TEMPLATE_LITERAL.lastIndex = 0;
    let templateMatch;
    while ((templateMatch = TEMPLATE_LITERAL.exec(source))) {
      const value = templateMatch[1];
      if (!isTemplateCandidate(value, file)) continue;
      const line = source.slice(0, templateMatch.index).split("\n").length;
      hits.push({ file, value, line });
    }
  }
  return hits;
}

const catalogProblems = [];
const catalogs = new Map();
const catalogFiles = (await readdir(localeDir)).filter((file) => file.endsWith(".json")).sort();

for (const file of catalogFiles) {
  const id = file.slice(0, -".json".length);
  const path = resolve(localeDir, file);
  try {
    const raw = await readFile(path, "utf8");
    for (const key of duplicateKeys(raw)) {
      catalogProblems.push(`${relative(root, path)}: duplicate key ${JSON.stringify(key)}`);
    }
    catalogs.set(id, JSON.parse(raw));
  } catch (error) {
    catalogProblems.push(`${relative(root, path)}: invalid JSON (${error.message})`);
  }
}

const english = catalogs.get("en");
if (!english) {
  catalogProblems.push("src/i18n/locales/en.json is missing.");
} else {
  const englishKeys = Object.keys(english);
  for (const [id, catalog] of catalogs) {
    const keys = Object.keys(catalog);
    const missing = englishKeys.filter((key) => !(key in catalog));
    const extra = keys.filter((key) => !(key in english));
    for (const key of missing) {
      catalogProblems.push(`${id}.json: missing key ${JSON.stringify(key)}`);
    }
    for (const key of extra) {
      catalogProblems.push(`${id}.json: extra key ${JSON.stringify(key)}`);
    }
    for (const key of keys) {
      const value = catalog[key];
      if (typeof value !== "string" || !value.trim()) {
        catalogProblems.push(`${id}.json: ${JSON.stringify(key)} has an empty value`);
        continue;
      }
      try {
        new IntlMessageFormat(value, id);
      } catch (error) {
        catalogProblems.push(
          `${id}.json: ${JSON.stringify(key)} has invalid ICU syntax (${error.message})`,
        );
      }
      if (key in english) {
        const expected = placeholders(english[key]);
        const actual = placeholders(value);
        if (expected.join(",") !== actual.join(",")) {
          catalogProblems.push(
            `${id}.json: ${JSON.stringify(key)} placeholders [${actual.join(
              ", ",
            )}] do not match English [${expected.join(", ")}]`,
          );
        }
      }
    }
  }
}

let generatedTypes = "";
try {
  generatedTypes = await readFile(typesPath, "utf8");
} catch {
  generatedTypes = "";
}
if (english && generatedTypes !== renderTypes(english)) {
  catalogProblems.push(
    `${TYPES_RELATIVE} is out of date. Run node scripts/i18n-types.mjs and commit the result.`,
  );
}

if (catalogProblems.length) {
  console.error(`Found ${catalogProblems.length} catalog problem(s):`);
  for (const problem of catalogProblems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

const hits = (await Promise.all(scanDirs.map((dir) => collect(resolve(root, dir))))).flat();

const current = new Map();
for (const hit of hits) {
  if (!current.has(hit.file)) current.set(hit.file, new Set());
  current.get(hit.file).add(hit.value);
}

let baseline = {};
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
  baseline = {};
}

if (update) {
  const next = {};
  for (const file of [...current.keys()].sort()) {
    next[file] = [...current.get(file)].sort();
  }
  await writeFile(baselinePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  const unique = Object.values(next).reduce((total, values) => total + values.length, 0);
  console.log(
    `i18n baseline updated: ${unique} unique strings (${hits.length} occurrences) in ${Object.keys(next).length} files.`,
  );
  process.exit(0);
}

const problems = [];
for (const hit of hits) {
  if (!(baseline[hit.file] ?? []).includes(hit.value)) {
    problems.push(`${hit.file}:${hit.line}: new UI string ${JSON.stringify(hit.value)}`);
  }
}

const stale = [];
for (const [file, values] of Object.entries(baseline)) {
  const present = current.get(file) ?? new Set();
  for (const value of values) {
    if (!present.has(value)) stale.push(`${file}: ${JSON.stringify(value)}`);
  }
}

if (problems.length) {
  console.error(
    `Found ${problems.length} hard-coded UI string(s). Add them to src/i18n/locales/en.json and use t(), or run "npm run check:i18n -- --update" if they cannot move yet.`,
  );
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

if (stale.length) {
  console.warn(
    `i18n baseline has ${stale.length} stale entr${stale.length === 1 ? "y" : "ies"}; run "npm run check:i18n -- --update" to prune.`,
  );
}

const uniqueFrozen = [...current.values()].reduce((total, values) => total + values.size, 0);
console.log(
  `i18n check passed: ${catalogs.size} catalogs, ${Object.keys(english).length} keys, ${uniqueFrozen} frozen strings (${hits.length} occurrences), no new hard-coded UI text.`,
);
