/**
 * Blocks growth of large source files in the frontend and the Rust shell.
 *
 * The frontend scan covers every TypeScript and CSS file under `src`; the Rust
 * scan covers every `*.rs` file under `src-tauri/src`, including `*_tests.rs`
 * modules because they are part of the same module surface. Each scope has its
 * own default budget and its own reviewed exception map in
 * `file-budgets.json`. A Rust exception records a reason; a new oversized Rust
 * file can never be recorded with `--update`.
 *
 * Run with `npm run check:file-budgets`. The pure rules live in
 * `file-budget-rules.mjs` and are covered by `tests/fileBudgetRules.test.ts`.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { evaluateScope, formatProblems, lineCount, planUpdate } from "./file-budget-rules.mjs";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "file-budgets.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const rustScope = config.rust ?? {};

/** Generated files are not maintained by hand and have no useful budget. */
const EXCLUDED = new Set(["src/i18n/types.generated.ts"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "target"]);

const FRONTEND_SOURCE = /\.(ts|css)$/;
const RUST_SOURCE = /\.rs$/;

async function collect(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(...(await collect(absolute, extensions)));
    } else if (extensions.test(entry.name)) {
      files.push(relative(root, absolute).split("\\").join("/"));
    }
  }
  return files;
}

async function entriesFor(directory, extensions, excluded = new Set()) {
  const files = (await collect(directory, extensions)).filter((file) => !excluded.has(file)).sort();
  const entries = [];
  for (const file of files) {
    entries.push({ file, lines: lineCount(await readFile(resolve(root, file), "utf8")) });
  }
  return entries;
}

const frontendEntries = await entriesFor(resolve(root, "src"), FRONTEND_SOURCE, EXCLUDED);
const rustEntries = await entriesFor(resolve(root, "src-tauri/src"), RUST_SOURCE);

const scopes = [
  {
    label: "Frontend",
    reviewed: false,
    scope: config,
    evaluation: evaluateScope({ scope: config, entries: frontendEntries, label: "Frontend" }),
  },
  {
    label: "Rust",
    reviewed: true,
    scope: rustScope,
    evaluation: evaluateScope({
      scope: rustScope,
      entries: rustEntries,
      label: "Rust",
      reviewed: true,
    }),
  },
];

if (process.argv.includes("--update")) {
  const updates = scopes.map(({ label, reviewed, scope, evaluation }) => ({
    label,
    reviewed,
    scope,
    update: planUpdate({
      scope,
      violations: evaluation.violations,
      stale: evaluation.stale,
      label,
      reviewed,
    }),
  }));
  const refused = updates.flatMap((item) => item.update.unknown);
  if (refused.length) {
    console.error("Refusing to record a new oversized file:");
    for (const entry of refused) {
      console.error(
        `- ${entry.file}: ${entry.lines} lines, budget ${entry.budget} (+${entry.lines - entry.budget})`,
      );
    }
    console.error(
      "Split the file or adjust the directory budget deliberately in file-budgets.json. New files must not be added to the legacy exception list.",
    );
    process.exit(1);
  }
  const invalid = updates.filter((item) => !item.update.ok);
  if (invalid.length) {
    console.error("File budget configuration is invalid:");
    for (const item of invalid) for (const error of item.update.errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const frontend = updates.find((item) => item.label === "Frontend").update;
  const rust = updates.find((item) => item.label === "Rust").update;
  const next = {
    defaultMax: config.defaultMax,
    directoryMax: config.directoryMax ?? {},
    files: frontend.next,
    rust: { defaultMax: rustScope.defaultMax, files: rust.next },
  };
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
  const recorded = frontend.updated + rust.updated;
  console.log(`Recorded ${recorded} existing file budget(s).`);
  const pruned = frontend.pruned + rust.pruned;
  if (pruned) console.log(`Removed ${pruned} stale exception(s).`);
  process.exit(0);
}

if (scopes.some((item) => !item.evaluation.ok)) {
  console.error("File budget check failed:");
  for (const { evaluation } of scopes) {
    for (const line of formatProblems(evaluation)) console.error(line);
  }
  console.error("Split the file or record a reviewed temporary increase in file-budgets.json.");
  if (scopes.some((item) => item.evaluation.stale.length)) {
    console.error("Run npm run check:file-budgets -- --update to prune stale exceptions.");
  }
  process.exit(1);
}

console.log(
  `File budget check passed: ${frontendEntries.length} files, default ${config.defaultMax} lines; Rust ${rustEntries.length} files, default ${rustScope.defaultMax} lines.`,
);
