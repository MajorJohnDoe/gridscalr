import { launchBrowser, openDemoProject, startVite } from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_BENCH_PORT ?? 1430);
const itemCount = Number(process.env.GRIDSCALR_BENCH_ITEMS ?? 2000);
const vite = await startVite({ port });
const browser = await launchBrowser();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await openDemoProject(page, { base: vite.base });
  const result = await page.evaluate((targetCount) => {
    const store = window.__gridscalr?.store;
    if (!store?.project) throw new Error("The dev store hook is unavailable.");
    const layer = store.project.layers.find((entry) => entry.kind === "measure");
    if (!layer) throw new Error("No measurement layer in the benchmark project.");
    const base = layer.items[0];
    if (!base) throw new Error("No measurement item in the benchmark project.");

    // Keep the canvas cheap so the measurement targets history and mutation
    // cost rather than drawing thousands of labels.
    for (const entry of store.project.layers) entry.visible = false;
    for (let index = 0; index < targetCount; index += 1) {
      layer.items.push({
        ...base,
        id: `bench_${index}`,
        label: `Benchmark ${index}`,
        points: base.points.map((point) => ({ ...point })),
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
      });
    }

    const samples = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      store.mutate((project) => {
        const first = project.layers.find((entry) => entry.kind === "measure")?.items[0];
        if (first) first.updatedAt = new Date().toISOString();
      });
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return {
      items: layer.items.length,
      averageMs: Number(average.toFixed(2)),
      medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(2)),
      p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(2)),
      projectKb: Number((JSON.stringify(store.project).length / 1024).toFixed(1)),
    };
  }, itemCount);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await vite.stop();
}
