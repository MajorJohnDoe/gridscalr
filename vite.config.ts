import { cp, mkdir } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;
const root = fileURLToPath(new URL(".", import.meta.url));
const wasmDir = path.join(root, "node_modules/pdfjs-dist/wasm");
const ocrFiles: Record<string, string> = {
  "tesseract/worker.min.js": path.join(root, "node_modules/tesseract.js/dist/worker.min.js"),
  "tesseract/tesseract-core-simd.wasm.js": path.join(
    root,
    "node_modules/tesseract.js-core/tesseract-core-simd.wasm.js",
  ),
  "tesseract/tesseract-core-simd.wasm": path.join(
    root,
    "node_modules/tesseract.js-core/tesseract-core-simd.wasm",
  ),
  "tessdata/eng.traineddata.gz": path.join(
    root,
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  ),
  "tessdata/swe.traineddata.gz": path.join(
    root,
    "node_modules/@tesseract.js-data/swe/4.0.0_best_int/swe.traineddata.gz",
  ),
};
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  version: string;
};

/**
 * PDF.js 6 decodes CCITT fax data and JBIG2 through WebAssembly. It fetches
 * `${wasmUrl}jbig2.wasm` at runtime, so the assets have to sit next to the app
 * in development and in the production bundle.
 */
function pdfjsWasm(): Plugin {
  return {
    name: "pdfjs-wasm",
    configureServer(server) {
      server.middlewares.use("/wasm", (request, response, next) => {
        const name = decodeURIComponent((request.url ?? "").split("?")[0]).replace(/^\/+/, "");
        if (!name || name.includes("..") || name.includes("/")) {
          next();
          return;
        }
        const file = path.join(wasmDir, name);
        if (!existsSync(file)) {
          next();
          return;
        }
        response.setHeader(
          "Content-Type",
          name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        createReadStream(file).pipe(response);
      });
    },
    async closeBundle() {
      const target = path.join(root, "dist", "wasm");
      await mkdir(target, { recursive: true });
      await cp(wasmDir, target, { recursive: true });
    },
  };
}

/** Serves and bundles the local OCR worker, WASM core and language data. */
function ocrAssets(): Plugin {
  return {
    name: "ocr-assets",
    configureServer(server) {
      for (const prefix of ["/tesseract", "/tessdata"]) {
        server.middlewares.use(prefix, (request, response, next) => {
          const name = decodeURIComponent((request.url ?? "").split("?")[0]).replace(/^\/+/, "");
          if (!name || name.includes("..") || name.includes("/")) {
            next();
            return;
          }
          const file = ocrFiles[`${prefix.slice(1)}/${name}`];
          if (!file || !existsSync(file)) {
            next();
            return;
          }
          response.setHeader(
            "Content-Type",
            name.endsWith(".wasm")
              ? "application/wasm"
              : name.endsWith(".gz")
                ? "application/gzip"
                : "text/javascript",
          );
          createReadStream(file).pipe(response);
        });
      }
    },
    async closeBundle() {
      for (const [relative, source] of Object.entries(ocrFiles)) {
        const target = path.join(root, "dist", relative);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(source, target);
      }
    },
  };
}

export default defineConfig({
  // Tauri serves the production frontend from a custom protocol. Relative
  // asset URLs work on every platform and keep the built index.html portable.
  base: "./",
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [pdfjsWasm(), ocrAssets()],
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // docs:capture writes these files while the dev server is running. They
      // are static help assets, so avoid a full reload for every screenshot.
      ignored: ["**/src-tauri/**", "**/docs/screenshots/**"],
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: ["es2022", "chrome120", "safari16"],
    // Production builds do not ship source maps. Set GRIDSCALR_SOURCEMAPS=1
    // when a debuggable build is needed.
    sourcemap: process.env.GRIDSCALR_SOURCEMAPS === "1",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
