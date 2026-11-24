import { performanceProfile } from "./performance-budget-rules.mjs";
import { launchBrowser, openDemoProject, startVite } from "./ui-harness.mjs";

/**
 * Repeatable interactive baseline: a scripted pan, a three-step zoom and a
 * short edit loop in the browser fallback, read back from the opt-in
 * performance recorder (`src/features/perfMonitor`).
 *
 * One JSON object goes to stdout so a phase can be compared with the next one.
 * `GRIDSCALR_PERF_PROBE_RUNS` (default 3) repeats the whole scenario and the
 * median of every number is reported. `GRIDSCALR_PERF_PROBE_SHAPE=ci|reference`
 * reshapes the open project before the edit loop so the serialize share is
 * measured on the large-project profile; the pan and zoom always use the demo.
 * A failed interaction exits non-zero rather than printing a number.
 */

const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 1;
const PAN_MS = 5000;
const PAN_STEPS = 120;
const PAN_DISTANCE = 360;
const ZOOM_STEPS = 3;
const EDIT_COUNT = 20;
const RECORDER_MODULE = "/src/features/perfMonitor/index.ts";

const runs = Math.max(1, Number.parseInt(process.env.GRIDSCALR_PERF_PROBE_RUNS ?? "3", 10) || 3);
const shapeName = process.env.GRIDSCALR_PERF_PROBE_SHAPE ?? "demo";
const shape = shapeName === "demo" ? null : performanceProfile(shapeName);
const port = Number(process.env.GRIDSCALR_PERF_PORT ?? 1439);

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function spreadPercent(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return 0;
  const middle = median(clean);
  if (!middle) return 0;
  return round(((Math.max(...clean) - Math.min(...clean)) / middle) * 100, 1);
}

/** Sums the user-timing measures the recorder wrote, grouped by span name. */
function measureTotals(raw) {
  const totals = {};
  for (const [name, durations] of Object.entries(raw)) {
    totals[name] = {
      count: durations.length,
      totalMs: round(durations.reduce((sum, value) => sum + value, 0)),
    };
  }
  return totals;
}

function spanRows(snapshot, raw, extra = {}) {
  const totals = measureTotals(raw);
  const rows = {};
  for (const row of snapshot.spans) {
    const total = totals[row.name] ?? { totalMs: null };
    rows[row.name] = {
      count: row.count,
      totalMs: total.totalMs,
      p50: round(row.p50),
      p95: round(row.p95),
      max: round(row.max),
    };
  }
  for (const name of Object.keys(extra)) rows[name] = { ...rows[name], ...extra[name] };
  return rows;
}

function medianFrames(frames) {
  if (!frames.length) return null;
  return {
    p50: round(median(frames.map((entry) => entry.p50))),
    p95: round(median(frames.map((entry) => entry.p95))),
    p99: round(median(frames.map((entry) => entry.p99))),
    max: round(median(frames.map((entry) => entry.max))),
    overGoodMs: Math.round(median(frames.map((entry) => entry.overGoodMs))),
    count: Math.round(median(frames.map((entry) => entry.count))),
    fps: round(median(frames.map((entry) => entry.fps))),
  };
}

/** Median of every span row across runs; a row missing from a run is skipped. */
function medianSpans(spanSets) {
  const names = new Set(spanSets.flatMap((set) => Object.keys(set)));
  const rows = {};
  for (const name of names) {
    const entries = spanSets.map((set) => set[name]).filter(Boolean);
    rows[name] = {
      count: Math.round(median(entries.map((entry) => entry.count))),
      totalMs: round(median(entries.map((entry) => entry.totalMs))),
      p50: round(median(entries.map((entry) => entry.p50))),
      p95: round(median(entries.map((entry) => entry.p95))),
      max: round(median(entries.map((entry) => entry.max))),
    };
  }
  return rows;
}

function snapshotFrames(snapshot) {
  return snapshot.frames
    ? {
        p50: round(snapshot.frames.p50),
        p95: round(snapshot.frames.p95),
        p99: round(snapshot.frames.p99),
        max: round(snapshot.frames.max),
        overGoodMs: snapshot.frames.overGoodMs,
        count: snapshot.frames.count,
        fps: round(snapshot.frames.fps),
      }
    : null;
}

function percentile(values, fraction) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil(fraction * clean.length) - 1));
  return clean[index];
}

async function enableRecorder(page) {
  await page.evaluate(
    async ({ module, viewport }) => {
      const perf = await import(/* @vite-ignore */ module);
      const longTasks = [];
      let observer = null;
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            longTasks.push({ at: entry.startTime, ms: entry.duration });
        });
        observer.observe({ entryTypes: ["longtask"] });
      } catch {
        observer = null;
      }
      window.__perfProbe = { perf, longTasks, observer, viewport };
      perf.setPerfRecording(true);
      perf.clearPerfSamples();
    },
    { module: RECORDER_MODULE, viewport: VIEWPORT },
  );
}

async function readWindow(page) {
  return page.evaluate(() => {
    const probe = window.__perfProbe;
    const raw = {};
    for (const entry of performance.getEntriesByType("measure")) {
      (raw[entry.name] ??= []).push(entry.duration);
    }
    const snapshot = probe.perf.perfSnapshot(null);
    const project = window.__gridscalr?.store?.project ?? null;
    return {
      raw,
      snapshot: {
        frames: snapshot.frames,
        blocked: snapshot.blocked,
        spans: snapshot.spans,
        project: project
          ? {
              pages: project.pages.length,
              items: project.layers.reduce((sum, layer) => sum + layer.items.length, 0),
              documents: project.documents.length,
            }
          : null,
        heapBytes: snapshot.heapBytes,
      },
      longTasks: probe.longTasks.slice(),
      heapBytes: snapshot.heapBytes,
    };
  });
}

async function resetWindow(page) {
  await page.evaluate(() => {
    window.__perfProbe.perf.clearPerfSamples();
    window.__perfProbe.longTasks.length = 0;
  });
}

async function runEditLoop(page) {
  const result = await page.evaluate(async (count) => {
    const store = window.__gridscalr?.store;
    if (!store?.project) throw new Error("The dev store hook is unavailable.");
    window.__perfProbe.perf.clearPerfSamples();
    const durations = [];
    for (let index = 0; index < count; index += 1) {
      const started = performance.now();
      store.mutate((project) => {
        const first = project.layers.find((layer) => layer.kind === "measure")?.items[0];
        if (first) first.updatedAt = new Date().toISOString();
      });
      durations.push(performance.now() - started);
    }
    return durations;
  }, EDIT_COUNT);
  const captured = await readWindow(page);
  const serialize = captured.snapshot.spans.find((row) => row.name === "serialize") ?? null;
  const total = measureTotals(captured.raw).serialize?.totalMs ?? null;
  const p50 = percentile(result, 0.5);
  const p95 = percentile(result, 0.95);
  if (!serialize || serialize.count < 1) {
    throw new Error(`expected one serialize span per edit, saw ${serialize?.count ?? 0}`);
  }
  return {
    count: result.length,
    p50Ms: round(p50),
    p95Ms: round(p95),
    serializeCount: serialize.count,
    serializeTotalMs: total,
    serializeMsPerEdit: total === null ? null : round(total / serialize.count),
    serializeCountPerEdit: round(serialize.count / result.length, 3),
    serializeShareOfP95Percent:
      total === null || !p95 ? null : round((total / serialize.count / p95) * 100, 1),
    spans: spanRows(captured.snapshot, captured.raw),
  };
}

async function shapeProject(page, profile) {
  await page.evaluate(({ pages, items, images }) => {
    const store = window.__gridscalr?.store;
    const project = store?.project;
    if (!store || !project) throw new Error("The dev store hook is unavailable.");
    const measure = project.layers.find((layer) => layer.kind === "measure");
    const draw = project.layers.find((layer) => layer.kind === "draw");
    const base = measure?.items[0];
    if (!measure || !draw || !base) throw new Error("The probe project has no markup layers.");
    project.documents[0].pageCount = pages;
    project.pages = Array.from({ length: pages }, (_, index) => ({
      id: `probe_page_${index + 1}`,
      documentId: project.documents[0].id,
      localPage: index + 1,
      state: {},
    }));
    const perPage = Math.ceil(items / pages);
    measure.items = [];
    for (let index = 0; index < items; index += 1) {
      measure.items.push({
        ...base,
        id: `probe_${index}`,
        pageId: `probe_page_${(index % pages) + 1}`,
        label: `Probe ${index}`,
        points: base.points.map((point) => ({ x: point.x + (index % perPage) * 8, y: point.y })),
        categoryId: project.categories[index % project.categories.length]?.id,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
      });
    }
    project.assets = project.assets ?? {};
    draw.items = [];
    for (let index = 0; index < images; index += 1) {
      const id = `probe_image_${index}`;
      project.assets[id] = {
        id,
        name: `probe-${index}.png`,
        mime: "image/png",
        width: 1,
        height: 1,
        byteSize: 68,
        data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      };
      draw.items.push({
        id,
        pageId: "probe_page_1",
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
    store.emit("project");
  }, profile);
}

async function panAndZoom(page, box) {
  await page.keyboard.press("h");
  await page.waitForTimeout(120);
  const startX = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.5;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const before = await page.evaluate(() => ({
    panX: window.__gridscalr.store.ui.panX,
    panY: window.__gridscalr.store.ui.panY,
    zoom: window.__gridscalr.store.ui.zoom,
  }));
  const stepMs = PAN_MS / PAN_STEPS;
  for (let step = 1; step <= PAN_STEPS; step += 1) {
    const progress = step / PAN_STEPS;
    await page.mouse.move(
      startX - progress * PAN_DISTANCE + Math.sin(progress * Math.PI * 6) * 40,
      startY + Math.sin(progress * Math.PI * 4) * 50,
    );
    await page.waitForTimeout(stepMs);
  }
  await page.mouse.up();
  const panned = await page.evaluate(() => ({
    panX: window.__gridscalr.store.ui.panX,
    panY: window.__gridscalr.store.ui.panY,
  }));
  if (Math.abs(panned.panX - before.panX) < 50 && Math.abs(panned.panY - before.panY) < 50) {
    throw new Error(`the scripted pan did not move the view (${before.panX} -> ${panned.panX})`);
  }

  await page.mouse.move(startX, startY);
  await page.keyboard.down("Control");
  try {
    for (let step = 0; step < ZOOM_STEPS; step += 1) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(260);
    }
  } finally {
    await page.keyboard.up("Control");
  }
  const zoomed = await page.evaluate(() => window.__gridscalr.store.ui.zoom);
  if (!(zoomed > before.zoom * 1.05)) {
    throw new Error(`the scripted zoom did not zoom in (${before.zoom} -> ${zoomed})`);
  }
  return {
    panDistance: round(Math.abs(panned.panX - before.panX), 1),
    zoomFactor: round(zoomed / before.zoom, 3),
  };
}

async function runOnce(browser, base) {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: "dark",
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const project = await openDemoProject(page, { base });
    const canvas = page.locator("#canvas-interaction");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("the interaction canvas has no layout box");
    await enableRecorder(page);

    if (shape) {
      await shapeProject(page, shape);
      await page.waitForTimeout(300);
    }

    const edits = await runEditLoop(page);
    await resetWindow(page);

    const gesture = await panAndZoom(page, box);
    const interaction = await readWindow(page);
    if (!interaction.snapshot.frames) throw new Error("the recorder sampled no frames");
    if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join("; ")}`);

    const blockedTotal = interaction.longTasks.reduce((sum, entry) => sum + entry.ms, 0);
    const blockedMax = interaction.longTasks.reduce((max, entry) => Math.max(max, entry.ms), 0);
    return {
      project: project.name,
      gesture,
      frames: snapshotFrames(interaction.snapshot),
      blockedWindows: interaction.longTasks.length,
      blockedTotalMs: round(blockedTotal),
      blockedMaxMs: round(blockedMax),
      spans: spanRows(
        interaction.snapshot,
        interaction.raw,
        edits.spans.serialize ? { serialize: edits.spans.serialize } : {},
      ),
      edits,
      heapBytes: interaction.heapBytes,
      shape: interaction.snapshot.project,
    };
  } finally {
    await page.close();
  }
}

const startedAt = new Date().toISOString();
let vite;
let browser;
let failure = null;
const results = [];
try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  for (let run = 0; run < runs; run += 1) results.push(await runOnce(browser, vite.base));
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await browser?.close().catch(() => undefined);
  await vite?.stop();
}

if (failure) {
  console.error(`perf probe failed: ${failure}`);
  process.exit(1);
}

const first = results[0];
const summary = {
  tool: "perf-probe",
  generatedAt: startedAt,
  benchmark: "browser fallback, Chromium",
  profile: {
    requested: shapeName,
    demo: Boolean(shape) ? null : first.project,
    pages: first.shape?.pages ?? null,
    items: first.shape?.items ?? null,
    documents: first.shape?.documents ?? null,
  },
  viewport: { ...VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR },
  runs,
  gesture: {
    panMs: PAN_MS,
    panSteps: PAN_STEPS,
    zoomSteps: ZOOM_STEPS,
    panDistance: round(median(results.map((entry) => entry.gesture.panDistance)), 1),
    zoomFactor: round(median(results.map((entry) => entry.gesture.zoomFactor)), 3),
  },
  frames: medianFrames(results.map((entry) => entry.frames).filter(Boolean)),
  blockedWindows: Math.round(median(results.map((entry) => entry.blockedWindows))),
  blockedTotalMs: round(median(results.map((entry) => entry.blockedTotalMs))),
  blockedMaxMs: round(median(results.map((entry) => entry.blockedMaxMs))),
  spans: medianSpans(results.map((entry) => entry.spans)),
  edits: {
    count: EDIT_COUNT,
    p50Ms: round(median(results.map((entry) => entry.edits.p50Ms))),
    p95Ms: round(median(results.map((entry) => entry.edits.p95Ms))),
    serializeCount: Math.round(median(results.map((entry) => entry.edits.serializeCount))),
    serializeTotalMs: round(median(results.map((entry) => entry.edits.serializeTotalMs))),
    serializeMsPerEdit: round(median(results.map((entry) => entry.edits.serializeMsPerEdit))),
    serializeCountPerEdit: round(
      median(results.map((entry) => entry.edits.serializeCountPerEdit)),
      3,
    ),
    serializeShareOfP95Percent: round(
      median(results.map((entry) => entry.edits.serializeShareOfP95Percent)),
      1,
    ),
    spans: medianSpans(results.map((entry) => entry.edits.spans)),
  },
  heapBytes: results.find((entry) => Number.isFinite(entry.heapBytes))?.heapBytes ?? null,
  variance: {
    framesP95Percent: spreadPercent(results.map((entry) => entry.frames?.p95)),
    editsP95Percent: spreadPercent(results.map((entry) => entry.edits.p95Ms)),
  },
  runsDetail: results.map((entry) => ({
    frames: entry.frames,
    blockedWindows: entry.blockedWindows,
    edits: {
      p50Ms: entry.edits.p50Ms,
      p95Ms: entry.edits.p95Ms,
      serializeTotalMs: entry.edits.serializeTotalMs,
      serializeShareOfP95Percent: entry.edits.serializeShareOfP95Percent,
    },
    heapBytes: entry.heapBytes,
  })),
};

console.log(JSON.stringify(summary, null, 2));
