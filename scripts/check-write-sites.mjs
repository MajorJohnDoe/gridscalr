/**
 * Ratchets down inline project writes inside `store.mutate` closures.
 *
 * Every TypeScript file under `src` is scanned with the TypeScript parser. A
 * write site is a direct assignment or `delete` on a project-derived identifier
 * inside a mutate callback; the reviewed counts live in `write-sites.json`.
 * The gate fails when any file exceeds its reviewed count or the total grows.
 * `--update` only lowers the recorded counts or prunes entries with no site
 * left, so it can never accept a new inline write.
 *
 * Run with `npm run check:write-sites`. The analyzer and budget rules live in
 * `write-site-rules.mjs` and are covered by `tests/writeSiteGate.test.ts`.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  evaluateWriteSites,
  findWriteSites,
  formatProblems,
  planUpdate,
} from "./write-site-rules.mjs";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "write-sites.json");
const config = JSON.parse(await readFile(configPath, "utf8"));

/** Generated files are not maintained by hand and carry no write sites. */
const EXCLUDED = new Set(["src/i18n/types.generated.ts"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "target"]);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(...(await collect(absolute)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(relative(root, absolute).split("\\").join("/"));
    }
  }
  return files;
}

const files = (await collect(resolve(root, "src"))).filter((file) => !EXCLUDED.has(file)).sort();
const entries = [];
for (const file of files) {
  const text = await readFile(resolve(root, file), "utf8");
  entries.push({ file, count: findWriteSites(text, file).length });
}

if (process.argv.includes("--update")) {
  const update = planUpdate({ config, entries });
  if (!update.ok) {
    console.error("Write-site budget update refused:");
    for (const error of update.errors) console.error(`- ${error}`);
    for (const entry of update.growth) {
      console.error(`- ${entry.file}: ${entry.count} inline writes, budget ${entry.budget}`);
    }
    process.exit(1);
  }
  await writeFile(configPath, `${JSON.stringify(update.next, null, 2)}\n`);
  console.log(
    `Write-site budget updated: lowered ${update.updated} file(s), pruned ${update.pruned} file(s), total ${update.next.total}.`,
  );
  process.exit(0);
}

const evaluation = evaluateWriteSites({ config, entries });
const withSites = evaluation.results
  .filter((entry) => entry.count > 0)
  .sort((a, b) => a.file.localeCompare(b.file));
console.log(
  `Write-site counts (${evaluation.actualTotal} total, budget ${evaluation.totalBudget}):`,
);
for (const entry of withSites) {
  console.log(`  ${String(entry.count).padStart(3)}  ${entry.file}`);
}

if (!evaluation.ok) {
  console.error("Write-site check failed:");
  for (const line of formatProblems(evaluation)) console.error(line);
  console.error(
    "Move the write into a command module. If an existing count should ratchet down, run npm run check:write-sites -- --update.",
  );
  if (evaluation.stale.length) {
    console.error("Run npm run check:write-sites -- --update to prune stale entries.");
  }
  process.exit(1);
}

console.log(
  `Write-site check passed: ${evaluation.actualTotal} inline project writes across ${withSites.length} files.`,
);
