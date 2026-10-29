import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function findAvailablePort(preferred) {
  for (let port = preferred; port < preferred + 100; port += 1) {
    const available = await new Promise((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.once("listening", () => probe.close(() => resolve(true)));
      probe.listen({ port, host: "127.0.0.1", exclusive: true });
    });
    if (available) return port;
  }
  throw new Error(`No free local port between ${preferred} and ${preferred + 99}.`);
}

export async function startVite({ port: preferredPort = 1420 } = {}) {
  const port = await findAvailablePort(preferredPort);
  let output = "";
  const viteCommand = resolve(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );
  const server = spawn(
    viteCommand,
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
      shell: process.platform === "win32",
    },
  );
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`Vite exited before the UI test started.\n${output}`);
      }
      try {
        const response = await fetch(base);
        if (response.ok) break;
      } catch {
        // Keep waiting for Vite to listen.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (Date.now() >= deadline) {
      throw new Error(`Vite did not start within 30 seconds.\n${output}`);
    }
  } catch (error) {
    if (server.exitCode === null) server.kill();
    throw error;
  }

  return {
    base,
    port,
    server,
    output: () => output,
    async stop() {
      if (server.exitCode !== null) return;
      server.kill();
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    },
  };
}

export async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    throw new Error(
      `Could not launch Chromium. Run "npx playwright install chromium" once and try again.\n${error}`,
    );
  }
}

export async function waitForApp(page) {
  await page.locator(".app-shell").waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".canvas-loading")?.classList.contains("is-visible"),
  );
  await page.waitForTimeout(350);
}

export async function waitForToastsGone(page) {
  await page.waitForFunction(() => !document.querySelector(".toast"), null, { timeout: 7000 });
}

/**
 * Opens the deterministic demo project through the browser fallback. The
 * project starts as a recovery snapshot so no native file paths are required.
 */
export async function openDemoProject(page, { base } = {}) {
  if (!base) throw new Error("openDemoProject requires a base URL.");
  const projectPath = resolve(repoRoot, "fixtures", "demo-project.gridscalr");
  const pdfPath = resolve(repoRoot, "fixtures", "industrial-plan.pdf");
  const project = JSON.parse(await readFile(projectPath, "utf8"));

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();
  await page.evaluate(
    (payload) => {
      localStorage.setItem("gridscalr.autosave.v1", JSON.stringify(payload));
    },
    { project, projectPath: null, savedAt: new Date().toISOString() },
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Restore last session" }).waitFor();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Restore last session" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(pdfPath);

  await page.getByText(project.name).first().waitFor();
  await waitForApp(page);
  await waitForToastsGone(page);
  return project;
}

export async function openMarkupsItem(page, itemId, kind = "all") {
  const panel = page.locator(".markups-panel");
  if (!(await panel.isVisible())) {
    await page.locator(".tool-markups").click();
  }
  await panel.waitFor({ state: "visible" });
  if (kind !== "all") {
    await panel.getByLabel("Filter markups by type").selectOption(kind);
  }
  await panel.locator(`[data-item-id="${itemId}"]`).click();
  await page.waitForTimeout(120);
  if (await panel.isVisible()) {
    await panel.getByRole("button", { name: "Close Markups list" }).click();
    await panel.waitFor({ state: "hidden" });
  }
  await waitForApp(page);
}

/**
 * Builds a session reference project from the demo takeoff. The reference PDF
 * is embedded as a TIF-style document so the browser fallback can compare it
 * without native file paths.
 */
export async function makeReferenceProject() {
  const project = JSON.parse(
    await readFile(resolve(repoRoot, "fixtures", "demo-project.gridscalr"), "utf8"),
  );
  const pdf = await readFile(resolve(repoRoot, "fixtures", "industrial-plan.pdf"));
  const document = project.documents[0];
  project.name = `${project.name} — revision B`;
  project.documents = [
    {
      ...document,
      kind: "tiff",
      path: null,
      relativePath: null,
      embeddedPdf: pdf.toString("base64"),
      source: { format: "tiff", dpi: [300, 300], originalName: "industrial-plan.pdf" },
    },
  ];
  const measure = project.layers.find((layer) => layer.kind === "measure");
  const draw = project.layers.find((layer) => layer.kind === "draw");
  const changed = measure.items.find((item) => item.kind === "length") ?? measure.items[0];
  changed.label = `${changed.label ?? "Item"} — revised`;
  changed.color = "#ff3366";
  if (draw.items.length) draw.items.pop();
  const added = structuredClone(changed);
  added.id = "item_reference_added";
  added.points = added.points.map((point) => ({ x: point.x + 40, y: point.y + 20 }));
  added.label = "Reference-only measurement";
  measure.items.push(added);
  const directory = await mkdtemp(join(tmpdir(), "gridscalr-compare-"));
  const path = join(directory, "reference.gridscalr");
  await writeFile(path, JSON.stringify(project));
  return path;
}

/** Opens the revision comparison through File → Compare revisions…. */
export async function openCompareProject(page, path) {
  await page.getByRole("menuitem", { name: "File" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Compare revisions…" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(path);
  await page.locator(".compare-panel").waitFor();
  await waitForApp(page);
}
