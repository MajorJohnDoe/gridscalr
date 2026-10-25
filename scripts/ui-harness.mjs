import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function startVite({ port = 1420 } = {}) {
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

  return {
    base,
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
  const pdfPath = resolve(repoRoot, "fixtures", "sample-plan.pdf");
  const project = JSON.parse(await readFile(projectPath, "utf8"));

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();
  await page.evaluate((payload) => {
    localStorage.setItem("gridscalr.autosave.v1", JSON.stringify(payload));
  }, { project, projectPath: null, savedAt: new Date().toISOString() });

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

export async function openMeasurementsItem(page, itemId, kind = "all") {
  await page.keyboard.press("Control+Shift+M");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.getByLabel("Filter by item type").selectOption(kind);
  await page.locator(`[data-item-id="${itemId}"]`).click();
  await dialog.waitFor({ state: "detached" });
  await waitForApp(page);
}
