/**
 * Development-only probes used by scripts/csp-regression.mjs. This module is
 * not imported by the app, so it is not part of the production bundle. It starts
 * the real Tesseract worker with the same options as src/search/ocr.ts so the
 * security policy check exercises the shipped worker bootstrap.
 */
import { createWorker } from "tesseract.js";

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

/** Starts the bundled OCR worker, compiles its WASM core and recognises a canvas. */
export async function probeOcrWorker(): Promise<{ ok: boolean; detail: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 90;
  const context = canvas.getContext("2d");
  if (!context) return { ok: false, detail: "no 2d context" };
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  context.font = "36px sans-serif";
  context.fillText("PLAN 12", 12, 56);

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker(["eng"], 1, {
      workerPath: assetUrl("tesseract/worker.min.js"),
      corePath: assetUrl("tesseract/tesseract-core-simd.wasm.js"),
      langPath: assetUrl("tessdata/"),
      gzip: true,
      workerBlobURL: true,
    });
    const result = await worker.recognize(canvas);
    const text = String(result.data.text ?? "").trim();
    return { ok: true, detail: text };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}

/** Proves a blob worker created by the page inherits the document policy. */
export async function probeWorkerPolicy(): Promise<{
  importOk: boolean;
  remoteBlocked: boolean;
  detail: string;
}> {
  const moduleUrl = new URL("/src/model/pathText.ts", document.baseURI).href;
  const importWorker = new Worker(
    URL.createObjectURL(
      new Blob([`import ${JSON.stringify(moduleUrl)}; postMessage("import-ok");`], {
        type: "text/javascript",
      }),
    ),
    { type: "module" },
  );
  const importResult = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), 5000);
    importWorker.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(String(event.data));
    });
    importWorker.addEventListener("error", (event) => {
      clearTimeout(timer);
      resolve(`error: ${event.message}`);
    });
  });
  importWorker.terminate();

  const remoteWorker = new Worker(
    URL.createObjectURL(
      new Blob(
        [
          `fetch("https://example.com/").then(` +
            `() => postMessage("fetched"), (error) => postMessage("blocked: " + error.message));`,
        ],
        { type: "text/javascript" },
      ),
    ),
  );
  const remoteResult = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), 8000);
    remoteWorker.addEventListener("message", (event) => {
      clearTimeout(timer);
      resolve(String(event.data));
    });
    remoteWorker.addEventListener("error", (event) => {
      clearTimeout(timer);
      resolve(`error: ${event.message}`);
    });
  });
  remoteWorker.terminate();

  return {
    importOk: importResult === "import-ok",
    remoteBlocked: remoteResult.startsWith("blocked:"),
    detail: `${importResult} / ${remoteResult}`,
  };
}
