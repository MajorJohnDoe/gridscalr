import { launchBrowser, openDemoProject, startVite } from "./ui-harness.mjs";

/**
 * Builds the deterministic reference project in the browser fallback and
 * measures the documented budgets. `benchmark-large-project.mjs` prints the
 * numbers; `check-performance-budget.mjs` fails on a breach.
 *
 * Source PDF bytes are not duplicated in the benchmark; the Rust package tests
 * exercise the streaming 1 GB path separately.
 */
export async function runLargeProjectBench({ profile, port = 1431 } = {}) {
  if (!profile) throw new Error("runLargeProjectBench needs a resolved performance profile.");
  const vite = await startVite({ port });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
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

        project.documents[0].pageCount = targetPages;
        project.pages = Array.from({ length: targetPages }, (_, index) => ({
          id: `bench_page_${index + 1}`,
          documentId: project.documents[0].id,
          localPage: index + 1,
          state: {},
        }));
        const perPage = Math.ceil(targetItems / targetPages);
        measure.items = [];
        for (let index = 0; index < targetItems; index += 1) {
          const pageNumber = (index % targetPages) + 1;
          measure.items.push({
            ...base,
            id: `bench_${index}`,
            pageId: `bench_page_${pageNumber}`,
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
            pageId: "bench_page_1",
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

        const latestAutosaveAt = async () => {
          const request = indexedDB.open("gridscalr", 2);
          const records = await new Promise((resolve) => {
            request.onerror = () => resolve([]);
            request.onsuccess = () => {
              const database = request.result;
              if (!database.objectStoreNames.contains("recovery")) {
                database.close();
                resolve([]);
                return;
              }
              const transaction = database.transaction("recovery", "readonly");
              const get = transaction.objectStore("recovery").getAll();
              get.onsuccess = () => {
                database.close();
                resolve(Array.isArray(get.result) ? get.result : []);
              };
              get.onerror = () => {
                database.close();
                resolve([]);
              };
            };
          });
          const autosaves = records.filter((record) => record?.kind !== "checkpoint");
          return (
            autosaves
              .map((record) => String(record?.savedAt ?? ""))
              .sort()
              .at(-1) ?? null
          );
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

        // Autosave is a 900 ms debounce plus the IndexedDB recovery write. The
        // controller throttles further writes to the autosave interval, so the
        // measurement closes and reopens the project: that is exactly the first
        // autosave after opening the reference project, with the debounce and
        // the write both included.
        store.closeProject();
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
        const previousAutosave = await latestAutosaveAt();
        store.setProject(JSON.parse(serialized), null);
        const autosaveStarted = performance.now();
        store.mutate((next) => {
          const first = next.layers.find((entry) => entry.kind === "measure")?.items[0];
          if (first) first.label = "Autosave benchmark";
        });
        let autosaveMs = null;
        for (let attempt = 0; attempt < 120; attempt += 1) {
          await new Promise((resolveWait) => setTimeout(resolveWait, 50));
          const latest = await latestAutosaveAt();
          if (latest && latest !== previousAutosave) {
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
      {
        targetItems: profile.items,
        targetPages: profile.pages,
        targetImages: profile.images,
      },
    );
    const markupsStarted = performance.now();
    await page.keyboard.press("Control+l");
    await page.locator(".markups-panel").waitFor({ state: "visible" });
    await page.locator(".markups-table tbody tr.markups-row").first().waitFor();
    result.markups = {
      openMs: Number((performance.now() - markupsStarted).toFixed(1)),
      renderedRows: await page.locator(".markups-table tbody tr.markups-row").count(),
      totalRows: result.items + result.images,
    };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const metrics = await cdp.send("Performance.getMetrics");
    const heapBytes = metrics.metrics.find((entry) => entry.name === "JSHeapUsedSize")?.value;
    result.memory = {
      jsHeapMb: Number.isFinite(heapBytes) ? Number((heapBytes / (1024 * 1024)).toFixed(1)) : null,
      note: "Browser JS heap only; the desktop working-set budget is checked on the packaged app.",
    };
    result.profile = profile;
    result.pageErrors = pageErrors;
    return result;
  } finally {
    await browser.close();
    await vite.stop();
  }
}
