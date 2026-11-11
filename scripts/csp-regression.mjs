/**
 * Browser regression test for the Content Security Policy.
 *
 * The desktop shell adds the production policy as an HTML response header, so
 * the browser fallback is the only place a test can read the document policy
 * directly. The Vite dev server injects app.security.devCsp as a meta tag from
 * the same configuration source. This script checks that policy, renders a PDF
 * through the bundled PDF.js worker, starts the bundled Tesseract worker and
 * proves a blob worker inherits the policy and cannot reach a remote origin.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  launchBrowser,
  openDemoProject,
  repoRoot,
  startVite,
  waitForToastsGone,
} from "./ui-harness.mjs";

const config = JSON.parse(await readFile(resolve(repoRoot, "src-tauri/tauri.conf.json"), "utf8"));
const devCsp = config.app?.security?.devCsp;
const productionCsp = config.app?.security?.csp;
assert.ok(devCsp, "tauri.conf.json needs app.security.devCsp");
assert.ok(productionCsp, "tauri.conf.json needs app.security.csp");
assert.ok(
  !/localhost|127\.0\.0\.1|ws:/.test(productionCsp.replaceAll("http://ipc.localhost", "")),
  "the production policy must not contain a development origin",
);

const pageErrors = [];
let browser;
let vite;

try {
  vite = await startVite({ port: Number(process.env.GRIDSCALR_CSP_PORT ?? 1436) });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.setDefaultTimeout(120_000);

  await openDemoProject(page, { base: vite.base });
  await waitForToastsGone(page);

  const meta = await page.evaluate(() => {
    const tag = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return tag?.getAttribute("content") ?? null;
  });
  assert.equal(
    meta,
    devCsp,
    "the dev server must inject app.security.devCsp as the only page policy",
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length,
    ),
    1,
    "exactly one page policy must be present",
  );

  // Opening the demo renders the first PDF page through the PDF.js worker.
  const canvases = await page.locator(".canvas-host canvas").count();
  assert.ok(canvases > 0, "the canvas should be mounted after opening the demo");
  assert.equal(await page.locator(".page-card").count(), 3, "expected three page cards");

  const workerPolicy = await page.evaluate(async () => {
    const probe = await import("/dev/securityProbe.ts");
    return probe.probeWorkerPolicy();
  });
  assert.equal(workerPolicy.importOk, true, `blob worker import failed: ${workerPolicy.detail}`);
  assert.equal(
    workerPolicy.remoteBlocked,
    true,
    `a blob worker reached a remote origin: ${workerPolicy.detail}`,
  );

  const ocr = await page.evaluate(async () => {
    const probe = await import("/dev/securityProbe.ts");
    return probe.probeOcrWorker();
  });
  assert.equal(ocr.ok, true, `the bundled OCR worker did not start: ${ocr.detail}`);
  assert.ok(
    ocr.detail.toUpperCase().includes("PLAN"),
    `the OCR worker returned no expected text: ${JSON.stringify(ocr.detail)}`,
  );

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  console.log(`CSP regression passed. OCR text: ${JSON.stringify(ocr.detail)}`);
} finally {
  await browser?.close();
  await vite?.stop();
}
