import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prints per-locale key coverage against the English source catalog.
 *
 *   node scripts/i18n-report.mjs
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localeDir = resolve(root, "src/i18n/locales");

const files = (await readdir(localeDir))
  .filter((file) => file.endsWith(".json"))
  .sort((a, b) => (a === "en.json" ? -1 : b === "en.json" ? 1 : a.localeCompare(b)));

const catalogs = new Map();
for (const file of files) {
  const id = file.slice(0, -".json".length);
  catalogs.set(id, JSON.parse(await readFile(resolve(localeDir, file), "utf8")));
}

const english = catalogs.get("en");
if (!english) {
  console.error("src/i18n/locales/en.json is missing.");
  process.exit(1);
}

const englishKeys = Object.keys(english);
console.log(`Locale coverage against en (${englishKeys.length} keys)`);
for (const [id, catalog] of catalogs) {
  const keys = new Set(Object.keys(catalog));
  const missing = englishKeys.filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !(key in english));
  const covered = englishKeys.length - missing.length;
  const percent = englishKeys.length ? (covered / englishKeys.length) * 100 : 100;
  const details = [
    missing.length ? `${missing.length} missing` : "",
    extra.length ? `${extra.length} extra` : "",
  ]
    .filter(Boolean)
    .join(", ");
  console.log(
    `  ${id.padEnd(8)} ${String(covered).padStart(3)}/${englishKeys.length} ${percent
      .toFixed(1)
      .padStart(5)}%${details ? ` (${details})` : ""}`,
  );
}
