import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { shots } from "./capture-docs-shots.mjs";
import { docsSourceFingerprint } from "./docs-fingerprint.mjs";
import { captureDocumentation } from "./docs-capture-flow.mjs";
import { launchBrowser, repoRoot as root, startVite } from "./ui-harness.mjs";

/**
 * Captures the documentation screenshots.
 *
 * `npm run docs:capture` writes `docs/screenshots/` and its manifest.
 * `npm run test:docs-capture` is the dry run: the same steps and the same
 * locators, written to a temporary folder, with no manifest and no change to
 * the committed screenshots. It fails on a broken locator between docs passes.
 */
const dryRun = process.argv.includes("--dry-run");
const screenshotDir = resolve(root, "docs", "screenshots");
const outputDir = dryRun ? await mkdtemp(join(tmpdir(), "gridscalr-docs-capture-")) : screenshotDir;
const port = Number(process.env.GRIDSCALR_DOCS_PORT ?? 1420);
const viewport = { width: 1920, height: 1080 };
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

let browser;
let vite;
try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });

  page.on("pageerror", (error) => {
    console.warn(`Page error: ${error.message}`);
  });

  await captureDocumentation(page, { outputDir, base: vite.base });

  if (dryRun) {
    const files = await readdir(outputDir);
    if (files.filter((name) => name.endsWith(".png")).length !== shots.length) {
      throw new Error(`Dry run wrote ${files.length} files for ${shots.length} screenshots.`);
    }
    console.log(
      `Screenshot dry run passed: ${shots.length} screenshots in ${outputDir}; docs/screenshots/ is untouched.`,
    );
  } else {
    const manifest = {
      generatedAt: new Date().toISOString(),
      appVersion: packageJson.version,
      sourceFingerprint: await docsSourceFingerprint(root),
      viewport,
      project: "fixtures/demo-project.gridscalr",
      screenshots: shots,
    };
    await writeFile(
      resolve(screenshotDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    console.log(`Captured ${shots.length} screenshots in ${screenshotDir}`);
  }
} catch (error) {
  console.error(`Documentation screenshot ${dryRun ? "dry run" : "capture"} failed.`);
  console.error(
    "A locator or accessible name in scripts/docs-capture-flow.mjs no longer matches the app.",
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite?.stop();
}
