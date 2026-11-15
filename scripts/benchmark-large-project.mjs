import { runLargeProjectBench } from "./bench-large-run.mjs";
import { performanceProfile } from "./performance-budget-rules.mjs";

const profile = performanceProfile(process.env.GRIDSCALR_BENCH_PROFILE ?? "reference", {
  items: Number(process.env.GRIDSCALR_BENCH_ITEMS ?? NaN),
  pages: Number(process.env.GRIDSCALR_BENCH_PAGES ?? NaN),
  images: Number(process.env.GRIDSCALR_BENCH_IMAGES ?? NaN),
});
const result = await runLargeProjectBench({
  profile,
  port: Number(process.env.GRIDSCALR_BENCH_PORT ?? 1431),
});
console.log(JSON.stringify(result, null, 2));
