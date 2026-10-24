import { cp, mkdir } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;
const root = fileURLToPath(new URL(".", import.meta.url));
const wasmDir = path.join(root, "node_modules/pdfjs-dist/wasm");
const packageJson = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
) as { version: string };

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

export default defineConfig({
  // Tauri serves the production frontend from a custom protocol. Relative
  // asset URLs work on every platform and keep the built index.html portable.
  base: "./",
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [pdfjsWasm()],
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: ["es2022", "chrome120", "safari16"],
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
