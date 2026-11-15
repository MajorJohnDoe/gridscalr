import { runLargeProjectBench } from "./bench-large-run.mjs";
import {
  evaluatePerformanceBudgets,
  formatBudgetRow,
  formatMeasure,
  performanceProfile,
} from "./performance-budget-rules.mjs";

/**
 * Fails when the deterministic reference project exceeds a budget documented in
 * `docs/limitations.md`. Set `GRIDSCALR_PERF_PROFILE=reference` to run the full
 * 150-page shape; the default `ci` shape is a quarter of the items.
 */
const name = process.env.GRIDSCALR_PERF_PROFILE ?? process.env.GRIDSCALR_BENCH_PROFILE ?? "ci";
const profile = performanceProfile(name, {
  items: Number(process.env.GRIDSCALR_BENCH_ITEMS ?? NaN),
  pages: Number(process.env.GRIDSCALR_BENCH_PAGES ?? NaN),
  images: Number(process.env.GRIDSCALR_BENCH_IMAGES ?? NaN),
});
const port = Number(process.env.GRIDSCALR_PERF_PORT ?? 1438);

let result;
try {
  result = await runLargeProjectBench({ profile, port });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const evaluation = evaluatePerformanceBudgets(result);
console.log(
  `Performance budget run: ${profile.name} profile, ${result.pages} pages, ${result.items} items, ` +
    `${result.images} images, ${result.projectMb} MB serialized project.`,
);
for (const row of evaluation.rows) console.log(formatBudgetRow(row));
console.log(
  `Serialization p95: ${formatMeasure(result.serialization?.p95Ms ?? null)}; ` +
    `Markups open: ${formatMeasure(result.markups?.openMs ?? null)} with ` +
    `${result.markups?.renderedRows}/${result.markups?.totalRows} rows rendered.`,
);
console.log(
  `Browser JS heap: ${result.memory?.jsHeapMb ?? "not measured"} MB ` +
    `(${result.memory?.note ?? ""})`.trim(),
);
if (result.pageErrors.length) {
  console.error(`Page errors during the benchmark: ${result.pageErrors.join("; ")}`);
  process.exit(1);
}

const failing = evaluation.rows.filter((row) => !row.pass);
if (failing.length) {
  console.error(`Performance budget breached: ${failing.map((row) => row.label).join(", ")}.`);
  process.exit(1);
}
console.log("Performance budget passed.");
