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
const PLACEHOLDER = /\{\s*([A-Za-z_][\w]*)\s*(?:[,}])/g;

function isCandidate(text) {
  if (text.length < 4 || !text.includes(" ")) return false;
  if (!/^[A-ZÅÄÖ]/.test(text)) return false;
  if (text.includes("${") || text.includes("\\n")) return false;
  if (/^https?:|^\/|^[.#]/.test(text)) return false;
  // Symbol artwork is SVG path data, not interface prose.
  if (/^[MLHVCSQTAZmlhvcsqtaz][MLHVCSQTAZmlhvcsqtaz0-9\s.,+-]*$/.test(text)) return false;
  return true;
}

function placeholders(value) {
  const names = new Set();
  for (const match of value.matchAll(PLACEHOLDER)) names.add(match[1]);
  return [...names].sort();
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
    catalogs.set(id, JSON.parse(await readFile(path, "utf8")));
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
