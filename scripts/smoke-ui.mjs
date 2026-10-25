import assert from "node:assert/strict";
import {
  launchBrowser,
  openDemoProject,
  repoRoot,
  startVite,
  waitForApp,
  waitForToastsGone,
} from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_UI_PORT ?? 1420);
const pageErrors = [];
let browser;
let vite;

try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const project = await openDemoProject(page, { base: vite.base });
  assert.equal(project.name, "Riverside House - Takeoff");
  assert.equal(await page.locator(".page-card").count(), 2, "expected two page cards");

  await page.keyboard.press("l");
  await page.locator(".context-tool", { hasText: "Length" }).waitFor();

  await page.keyboard.press("Control+Shift+M");
  const measurements = page.getByRole("dialog");
  await measurements.waitFor();
  const rows = await measurements.locator(".markup-row").count();
  assert.ok(rows >= 14, `expected at least 14 measurements on page 1, got ${rows}`);
  await page.keyboard.press("Escape");
  await measurements.waitFor({ state: "detached" });

  await page.keyboard.press("Control+Alt+q");
  const quantities = page.getByRole("dialog");
  await quantities.waitFor();
  assert.ok(
    (await quantities.locator(".quantity-category").count()) >= 1,
    "expected at least one quantity category",
  );
  await page.keyboard.press("Escape");
  await quantities.waitFor({ state: "detached" });

  await page.keyboard.press("F1");
  const help = page.getByRole("dialog");
  await help.waitFor();
  assert.equal(await help.getByRole("tab").count(), 4, "expected four help topics");
  await help.getByRole("tab", { name: "Workflows" }).click();
  await help.getByText("Operations technician (drifttekniker)").first().waitFor();
  await page.keyboard.press("Escape");
  await help.waitFor({ state: "detached" });

  await page.keyboard.press("v");
  await page.locator(".context-tool", { hasText: "Select" }).waitFor();
  await waitForApp(page);

  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.gridscalr$/, "expected a .gridscalr download");
  await waitForToastsGone(page);

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("; ")}`);
  console.log(`UI smoke passed: ${repoRoot}`);
} finally {
  await browser?.close();
  await vite?.stop();
}
