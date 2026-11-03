import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the i18n migration: existing hard-coded UI prose is frozen in
 * src/i18n/hardcoded-baseline.json, and any new string literal that looks like
 * interface text must go through the message catalog instead.
 *
 *   node scripts/check-i18n.mjs            fail on new hard-coded UI strings
 *   node scripts/check-i18n.mjs --update   regenerate the baseline
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanDirs = ["src/ui", "src/app", "src/features", "src/help"];
const baselinePath = resolve(root, "src/i18n/hardcoded-baseline.json");
const update = process.argv.includes("--update");

const STRING_LITERAL = /(["'])((?:\\.|(?!\1)[^\\])*)\1/g;

function isCandidate(text) {
  if (text.length < 4 || !text.includes(" ")) return false;
  if (!/^[A-ZÅÄÖ]/.test(text)) return false;
  if (text.includes("${") || text.includes("\\n")) return false;
  if (/^https?:|^\/|^[.#]/.test(text)) return false;
  return true;
}

async function collect(directory) {
  const hits = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      hits.push(...(await collect(path)));
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const source = await readFile(path, "utf8");
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
  console.log(
    `i18n baseline updated: ${hits.length} strings in ${Object.keys(next).length} files.`,
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
    `Found ${problems.length} hard-coded UI string(s). Add them to src/i18n/messages/en.ts and use t(), or run "npm run check:i18n -- --update" if they cannot move yet.`,
  );
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

if (stale.length) {
  console.warn(
    `i18n baseline has ${stale.length} stale entr${stale.length === 1 ? "y" : "ies"}; run "npm run check:i18n -- --update" to prune.`,
  );
}

console.log(`i18n check passed: ${hits.length} frozen strings, no new hard-coded UI text.`);
