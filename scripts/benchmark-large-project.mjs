import { launchBrowser, openDemoProject, startVite } from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_BENCH_PORT ?? 1431);
const itemCount = Number(process.env.GRIDSCALR_BENCH_ITEMS ?? 15000);
const pageCount = Number(process.env.GRIDSCALR_BENCH_PAGES ?? 150);
const imageCount = Number(process.env.GRIDSCALR_BENCH_IMAGES ?? 60);
const vite = await startVite({ port });
const browser = await launchBrowser();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await openDemoProject(page, { base: vite.base });
  const result = await page.evaluate(
    async ({ targetItems, targetPages, targetImages }) => {
      const store = window.__gridscalr?.store;
      if (!store?.project) throw new Error("The dev store hook is unavailable.");
      const project = store.project;
      const measure = project.layers.find((entry) => entry.kind === "measure");
      const draw = project.layers.find((entry) => entry.kind === "draw");
      const base = measure?.items[0];
      if (!measure || !draw || !base)
        throw new Error("The benchmark project has no markup layers.");

      // Synthetic reference project: many pages, many items and enough embedded
      // images to make the serialized project large. Source PDF bytes are not
      // duplicated; package streaming is benchmarked separately in Rust.
      project.documents[0].pageCount = targetPages;
      const perPage = Math.ceil(targetItems / targetPages);
      measure.items = [];
      for (let index = 0; index < targetItems; index += 1) {
        const pageNumber = (index % targetPages) + 1;
        measure.items.push({
          ...base,
          id: `bench_${index}`,
          page: pageNumber,
          label: `Benchmark ${index}`,
          points: base.points.map((point) => ({
            x: point.x + (index % perPage) * 8,
            y: point.y + Math.floor(index / perPage) * 4,
          })),
          categoryId: project.categories[index % project.categories.length]?.id,
          room: `Room ${index % 40}`,
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        });
      }
      project.assets = project.assets ?? {};
      draw.items = [];
      for (let index = 0; index < targetImages; index += 1) {
        const id = `bench_image_${index}`;
        project.assets[id] = {
          id,
          name: `bench-${index}.png`,
          mime: "image/png",
          width: 1,
          height: 1,
          byteSize: 68,
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        };
        draw.items.push({
          id,
          page: 1,
          kind: "image",
          assetId: id,
          points: [
            { x: 40 + index * 2, y: 40 },
            { x: 42 + index * 2, y: 42 },
          ],
          color: "#ffffff",
          strokeWidth: 0,
          opacity: 1,
          createdAt: base.createdAt,
          updatedAt: base.updatedAt,
        });
      }
      for (const layer of project.layers) layer.visible = false;
      store.emit("project");

      const samples = (count, run) => {
        const values = [];
        for (let index = 0; index < count; index += 1) {
          const started = performance.now();
          run(index);
          values.push(performance.now() - started);
        }
        values.sort((a, b) => a - b);
        return {
          averageMs: Number(
            (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
          ),
          medianMs: Number(values[Math.floor(values.length / 2)].toFixed(2)),
          p95Ms: Number(values[Math.floor(values.length * 0.95)].toFixed(2)),
        };
      };

      const mutation = samples(20, () => {
        store.mutate((next) => {
          const first = next.layers.find((entry) => entry.kind === "measure")?.items[0];
          if (first) first.updatedAt = new Date().toISOString();
        });
      });
      const serialization = samples(10, () => JSON.stringify(store.project));

      const serialized = JSON.stringify(store.project);
      const openStarted = performance.now();
      const reopened = JSON.parse(serialized);
      store.setProject(reopened, null);
      const openMs = performance.now() - openStarted;

      const pageSwitch = samples(20, (index) => {
        store.setPage((index % targetPages) + 1);
      });

      const previous = (await store.readAutosave())?.savedAt ?? null;
      const autosaveStarted = performance.now();
      store.mutate((next) => {
        const first = next.layers.find((entry) => entry.kind === "measure")?.items[0];
        if (first) first.label = "Autosave benchmark";
      });
      let autosaveMs = null;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const snapshot = await store.readAutosave();
        if (snapshot && snapshot.savedAt !== previous) {
          autosaveMs = performance.now() - autosaveStarted;
          break;
        }
      }

      return {
        pages: targetPages,
        items: measure.items.length,
        images: draw.items.length,
        projectMb: Number((serialized.length / (1024 * 1024)).toFixed(1)),
        openMs: Number(openMs.toFixed(1)),
        mutation,
        serialization,
        pageSwitch,
        autosaveMs: autosaveMs === null ? null : Number(autosaveMs.toFixed(1)),
      };
    },
    { targetItems: itemCount, targetPages: pageCount, targetImages: imageCount },
  );
  const markupsStarted = performance.now();
  await page.keyboard.press("Control+l");
  await page.locator(".markups-panel").waitFor({ state: "visible" });
  await page.locator(".markups-table tbody tr.markups-row").first().waitFor();
  const markupsOpenMs = performance.now() - markupsStarted;
  const renderedRows = await page.locator(".markups-table tbody tr.markups-row").count();
  result.markups = {
    openMs: Number(markupsOpenMs.toFixed(1)),
    renderedRows,
    totalRows: result.items + result.images,
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await vite.stop();
}
