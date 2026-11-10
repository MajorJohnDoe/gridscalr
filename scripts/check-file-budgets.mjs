import { readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "file-budgets.json");
const config = JSON.parse(await readFile(configPath, "utf8"));

/** Generated files are not maintained by hand and have no useful budget. */
const EXCLUDED = new Set(["src/i18n/types.generated.ts"]);

const SOURCE_EXTENSIONS = /\.(ts|css)$/;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...(await collect(absolute)));
    } else if (SOURCE_EXTENSIONS.test(entry.name)) {
      files.push(relative(root, absolute).split("\\").join("/"));
    }
  }
  return files;
}

function lineCount(text) {
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function budgetFor(file) {
  if (config.files?.[file] !== undefined) return config.files[file];
  let bestPrefix = "";
  for (const prefix of Object.keys(config.directoryMax ?? {})) {
    if (file === prefix || file.startsWith(`${prefix}/`)) {
      if (prefix.length > bestPrefix.length) bestPrefix = prefix;
    }
  }
  if (bestPrefix) return config.directoryMax[bestPrefix];
  return config.defaultMax;
}

const files = (await collect(resolve(root, "src"))).filter((file) => !EXCLUDED.has(file)).sort();
const results = [];
for (const file of files) {
  const text = await readFile(resolve(root, file), "utf8");
  results.push({ file, lines: lineCount(text), budget: budgetFor(file) });
}

const violations = results.filter((entry) => entry.lines > entry.budget);

if (process.argv.includes("--update")) {
  const unknown = violations.filter((entry) => config.files?.[entry.file] === undefined);
  if (unknown.length) {
    console.error("Refusing to record a new oversized file:");
    for (const entry of unknown) {
      console.error(
        `- ${entry.file}: ${entry.lines} lines, budget ${entry.budget} (+${entry.lines - entry.budget})`,
      );
    }
    console.error(
      "Split the file or adjust the directory budget deliberately in file-budgets.json. New files must not be added to the legacy exception list.",
    );
    process.exit(1);
  }

  const next = {
    defaultMax: config.defaultMax,
    directoryMax: config.directoryMax ?? {},
    files: { ...(config.files ?? {}) },
  };
  for (const entry of violations) next.files[entry.file] = entry.lines;
  next.files = Object.fromEntries(
    Object.entries(next.files).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Recorded ${violations.length} existing file budget(s).`);
  process.exit(0);
}

if (violations.length) {
  console.error("File budget check failed:");
  for (const entry of violations) {
    console.error(
      `- ${entry.file}: ${entry.lines} lines, budget ${entry.budget} (+${entry.lines - entry.budget})`,
    );
  }
  console.error("Split the file or record a reviewed temporary increase in file-budgets.json.");
  process.exit(1);
}

console.log(
  `File budget check passed: ${results.length} files, default ${config.defaultMax} lines.`,
);
