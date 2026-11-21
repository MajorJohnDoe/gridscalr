/**
 * Browser smoke test for the interactive "How it works" demo on the public site.
 *
 * The script serves `site-dist/` from a local, dependency-free HTTP server,
 * drives the demo in Chromium through Playwright and fails on:
 *
 * - a page error or a console error,
 * - a request to any origin other than the local server,
 * - a failed request or an HTTP error response,
 * - any behavioural assertion in the English, Swedish, reduced-motion, no-JS
 *   or mobile checks.
 *
 * Run it with `npm run test:site`, which rebuilds `site-dist/` first.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = resolve(root, "site-dist");
const DESKTOP = { width: 1360, height: 900 };
const SCENE_TIMEOUT = 20_000;
const UI_TIMEOUT = 10_000;

const EN = {
  storyEnd: "Calibrated plan. Warehouse 484 m², order 508,2 m² with 5 % waste.",
  areaEnd: "6 rooms, 120 m².",
  qtyStart: "Counting six doors, then windows and fixtures.",
  qtyEnd: "120 m², 19 objects.",
};
const SV = {
  qtyStart: "Räknar sex dörrar och sedan fönster och inventarier.",
};

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

let currentCheck = "startup";

function equal(actual, expected, what) {
  assert.equal(
    actual,
    expected,
    `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

async function check(name, fn) {
  currentCheck = name;
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${String(error.message).replaceAll("\n", "\n      ")}`);
    error.reported = true;
    throw error;
  }
}

/** Minimal static file server for site-dist, with directory index resolution. */
async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const target = resolve(siteDir, `.${relative}`);

      if (target !== siteDir && !target.startsWith(`${siteDir}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const body = await readFile(target);
      response.writeHead(200, {
        "Content-Type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` };
}

/**
 * Watches one page for the failures the demo must never cause. Every page uses
 * the same collectors so a stray external request fails the whole run.
 */
function watchPage(page, label, state) {
  const origin = state.origin;

  page.on("pageerror", (error) => {
    state.errors.push(`${label}: page error: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") state.errors.push(`${label}: console: ${message.text()}`);
  });

  page.on("request", (request) => {
    const url = request.url();
    if (/^(data|blob|about):/i.test(url)) return;
    try {
      if (new URL(url).origin !== origin)
        state.external.push(`${label}: ${request.method()} ${url}`);
    } catch {
      state.external.push(`${label}: unparseable request URL ${url}`);
    }
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "unknown error";
    if (!/ERR_ABORTED/.test(failure)) {
      state.failed.push(`${label}: ${request.method()} ${request.url()} (${failure})`);
    }
  });

  page.on("response", (response) => {
    if (response.status() >= 400) {
      state.failed.push(`${label}: HTTP ${response.status()} ${response.url()}`);
    }
  });
}

async function openDemo(page, baseUrl, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.classList.contains("hiw-ready"), {
    timeout: UI_TIMEOUT,
  });
  await page.locator("#how-it-works").scrollIntoViewIfNeeded({ timeout: UI_TIMEOUT });
}

async function liveText(page) {
  return (await page.locator("[data-hiw-live]").textContent())?.trim() ?? "";
}

async function waitForLive(page, expected) {
  await page.waitForFunction(
    (text) => document.querySelector("[data-hiw-live]")?.textContent?.trim() === text,
    expected,
    { timeout: SCENE_TIMEOUT },
  );
}

async function waitForText(page, selector, expected) {
  await page.waitForFunction(
    ({ selector: target, text }) => document.querySelector(target)?.textContent?.trim() === text,
    { selector, text: expected },
    { timeout: SCENE_TIMEOUT },
  );
}

async function waitForVisible(page, selector, visible = true) {
  await page.waitForFunction(
    ({ selector: target, visible: wanted }) => {
      const element = document.querySelector(target);
      if (!element) return false;
      const shown = Boolean(
        element.offsetWidth || element.offsetHeight || element.getClientRects().length,
      );
      return shown === wanted;
    },
    { selector, visible },
    { timeout: UI_TIMEOUT },
  );
}

async function stepStates(page) {
  return page.$$eval("#how-it-works .steps > li", (items) =>
    items.map((item) => ({
      active: item.classList.contains("hiw-step-active"),
      done: item.classList.contains("hiw-step-done"),
    })),
  );
}

async function assertStep(page, index, label) {
  const states = await stepStates(page);
  equal(states.length, 3, `${label}: step card count`);
  equal(
    states[index]?.active,
    true,
    `${label}: step card ${index + 1} is active (${JSON.stringify(states)})`,
  );
}

async function readNumber(page, selector) {
  const text = (await page.locator(selector).textContent())?.trim() ?? "";
  const match = /-?\d+(?:[.,]\d+)?/.exec(text);
  assert.ok(match, `expected a number in ${JSON.stringify(text)} from ${selector}`);
  return Number(match[0].replace(",", "."));
}

/** Reads the trailing object count from a "120 m² · 19 objects" total. */
async function readObjectTotal(page, selector) {
  const text = (await page.locator(selector).textContent())?.trim() ?? "";
  const match = /·\s*(\d+)\s+(?:objects?|objekt)\b/.exec(text);
  assert.ok(match, `expected an object count in ${JSON.stringify(text)} from ${selector}`);
  return Number(match[1]);
}

/** The complete hidden "How it works" demo on the English site. */
async function checkEnglish(context, baseUrl, state) {
  const page = await context.newPage();
  watchPage(page, "english", state);
  await openDemo(page, baseUrl, "/index.html#how-it-works");

  const play = page.locator("[data-hiw-play]");
  const replay = page.locator("[data-hiw-replay]");

  await check("english: play gate is the first gesture and no poster overlay exists", async () => {
    const posters = await page
      .locator("[data-hiw-poster], .hiw-poster, .hiw-poster-overlay, .hiw-play-overlay")
      .count();
    equal(posters, 0, "poster overlay count");
    equal(await play.isVisible(), true, "Play demo visible");
    equal(await replay.isVisible(), false, "Play again hidden before the first gesture");
    equal(
      await page.locator(".hiw").evaluate((element) => element.classList.contains("is-started")),
      false,
      "demo not started before the play gate",
    );
  });

  await play.click();

  await check(
    "english: Play demo hides, Play again appears and the live status starts",
    async () => {
      await waitForVisible(page, "[data-hiw-play]", false);
      await waitForVisible(page, "[data-hiw-replay]", true);
      const text = await liveText(page);
      assert.match(text, /^Playing the takeoff story: calibrate, then measure the warehouse\.$/);
    },
  );

  await check("english: the story finishes on the warehouse measurement and Takeoff", async () => {
    await waitForLive(page, EN.storyEnd);
    equal(
      (await page.locator("[data-hiw-measure] .hiw-measure-primary").textContent())?.trim(),
      "Warehouse floor",
      "warehouse label",
    );
    equal(
      (await page.locator("[data-hiw-measure] .hiw-measure-secondary").textContent())?.trim(),
      "484 m² · Perimeter 88 m",
      "warehouse measurement",
    );
    await waitForVisible(page, '[data-hiw-panel="takeoff"]', true);
    equal(
      await page
        .locator('[data-hiw-tab="takeoff"]')
        .evaluate((element) => element.classList.contains("is-active")),
      true,
      "Takeoff tab active",
    );
    equal(
      (
        await page.locator('[data-hiw-panel="takeoff"] [data-hiw-value]').first().textContent()
      )?.trim(),
      "484",
      "Takeoff floor quantity",
    );
    await assertStep(page, 2, "story end");
  });

  await page.locator('[data-hiw-mode="area"]').click();

  await check("english: Measure areas draws six rooms and ends at 120 m²", async () => {
    await waitForLive(page, EN.areaEnd);
    await waitForText(page, "[data-hiw-room-total]", "120 m²");
    equal(await readNumber(page, "[data-hiw-room-total]"), 120, "room total");
    await waitForVisible(page, '[data-hiw-panel="rooms"]', true);
    await assertStep(page, 1, "area end");
    equal(await page.locator('[data-hiw-mode="area"]').getAttribute("aria-pressed"), "true");
  });

  await page.locator('[data-hiw-mode="qty"]').click();

  await check(
    "english: Quantities counts 6 doors, 9 windows, 4 fixtures and 19 objects",
    async () => {
      await waitForLive(page, EN.qtyEnd);
      equal(await readNumber(page, "[data-hiw-qty-doors]"), 6, "doors");
      equal(await readNumber(page, "[data-hiw-qty-windows]"), 9, "windows");
      equal(await readNumber(page, "[data-hiw-qty-fixtures]"), 4, "fixtures");
      equal(await readObjectTotal(page, "[data-hiw-qty-total]"), 19, "object total");
      equal(
        (await page.locator("[data-hiw-qty-total]").textContent())?.trim(),
        "120 m² · 19 objects",
        "quantity total",
      );
      await waitForVisible(page, '[data-hiw-panel="qty"]', true);
      await assertStep(page, 2, "qty end");
      equal(await page.locator('[data-hiw-mode="qty"]').getAttribute("aria-pressed"), "true");
    },
  );

  await page.locator('[data-hiw-mode="qty"]').click();

  await check("english: clicking the active Quantities mode replays the scene", async () => {
    await waitForLive(page, EN.qtyStart);
    equal(await readNumber(page, "[data-hiw-qty-doors]"), 0, "doors reset");
    equal(await readObjectTotal(page, "[data-hiw-qty-total]"), 0, "object total reset");
  });

  await check("english: sound toggle updates aria-pressed and the stored preference", async () => {
    const sound = page.locator("[data-hiw-sound]");
    equal(await sound.getAttribute("aria-pressed"), "true", "sound starts enabled");
    await sound.click();
    await page.waitForFunction(
      () => document.querySelector("[data-hiw-sound]")?.getAttribute("aria-pressed") === "false",
      { timeout: UI_TIMEOUT },
    );
    equal(await page.evaluate(() => localStorage.getItem("gridscalr-site-sound")), "off");
    await sound.click();
    await page.waitForFunction(
      () => document.querySelector("[data-hiw-sound]")?.getAttribute("aria-pressed") === "true",
      { timeout: UI_TIMEOUT },
    );
    equal(await page.evaluate(() => localStorage.getItem("gridscalr-site-sound")), "on");
  });
}

/** Swedish copy, locale and a short interaction check. */
async function checkSwedish(context, baseUrl, state) {
  const page = await context.newPage();
  watchPage(page, "swedish", state);
  await openDemo(page, baseUrl, "/sv/");

  await check("swedish: localized page, play gate and mode labels", async () => {
    equal(await page.evaluate(() => document.documentElement.lang), "sv");
    const play = page.locator("[data-hiw-play]");
    equal((await play.textContent())?.trim(), "Spela upp demon", "Swedish play label");
    equal(await play.isVisible(), true, "Swedish play button visible");
    assert.match((await page.locator('[data-hiw-mode="area"]').textContent()) ?? "", /Areamätning/);
    assert.match((await page.locator('[data-hiw-mode="qty"]').textContent()) ?? "", /Mängder/);
  });

  await page.locator('[data-hiw-mode="qty"]').click();

  await check("swedish: the Quantities mode starts with Swedish live copy", async () => {
    await waitForLive(page, SV.qtyStart);
    await waitForVisible(page, "[data-hiw-play]", false);
    await waitForVisible(page, "[data-hiw-replay]", true);
    equal(await readNumber(page, "[data-hiw-qty-doors]"), 0, "doors start at zero");
  });
}

/** Reduced motion must jump to every final state with no cursor. */
async function checkReducedMotion(browser, baseUrl, state) {
  const context = await browser.newContext({ viewport: DESKTOP, reducedMotion: "reduce" });
  const page = await context.newPage();
  watchPage(page, "reduced", state);
  await openDemo(page, baseUrl, "/index.html#how-it-works");

  await check(
    "reduced motion: the story jumps to its end and the cursor stays hidden",
    async () => {
      await page.locator("[data-hiw-play]").click();
      await waitForLive(page, EN.storyEnd);
      equal(await page.locator("[data-hiw-cursor]").isHidden(), true, "cursor hidden");
      await waitForVisible(page, "[data-hiw-replay]", true);
    },
  );

  await page.locator('[data-hiw-mode="area"]').click();

  await check("reduced motion: Measure areas jumps to the 120 m² final state", async () => {
    await waitForLive(page, EN.areaEnd);
    await waitForText(page, "[data-hiw-room-total]", "120 m²");
    equal(await page.locator("[data-hiw-cursor]").isHidden(), true, "cursor stays hidden");
    await assertStep(page, 1, "reduced area end");
  });
}

/** Without JavaScript the interactive chrome stays hidden and the content remains. */
async function checkNoJavaScript(browser, baseUrl, state) {
  const context = await browser.newContext({
    viewport: DESKTOP,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  watchPage(page, "no-js", state);
  await page.goto(`${baseUrl}/index.html#how-it-works`, { waitUntil: "load" });

  await check("no-js: the mode bar is hidden and the plan plus three steps remain", async () => {
    equal(await page.locator(".hiw-bar").isVisible(), false, "mode bar hidden");
    equal(await page.locator("[data-hiw-play]").isVisible(), false, "play button hidden");
    equal(await page.locator(".hiw-plan").isVisible(), true, "plan image visible");
    const steps = page.locator("#how-it-works .steps > li");
    equal(await steps.count(), 3, "step card count");
    for (let index = 0; index < 3; index += 1) {
      equal(await steps.nth(index).isVisible(), true, `step card ${index + 1} visible`);
    }
  });
}

/** The 760px breakpoint switches to the compact result strip. */
async function checkMobile(browser, baseUrl, state) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  watchPage(page, "mobile", state);
  await openDemo(page, baseUrl, "/index.html#how-it-works");

  await check(
    "mobile: no horizontal overflow and the compact result strip is visible",
    async () => {
      await waitForVisible(page, ".hiw-compact", true);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      assert.ok(
        scrollWidth <= innerWidth + 1,
        `horizontal overflow: scrollWidth ${scrollWidth} > innerWidth ${innerWidth} + 1`,
      );
      equal(await page.locator(".hiw-bar").isVisible(), true, "mode bar visible");
    },
  );
}

async function main() {
  const { server, baseUrl, origin } = await startServer();
  console.log(`Serving site-dist at ${baseUrl}`);

  const state = { origin, errors: [], external: [], failed: [] };
  let browser;

  try {
    browser = await chromium.launch();

    // English and Swedish share a desktop context so the sound preference is
    // exercised across pages; reduced-motion, no-JS and mobile get their own.
    const desktop = await browser.newContext({ viewport: DESKTOP });
    await checkEnglish(desktop, baseUrl, state);
    await checkSwedish(desktop, baseUrl, state);
    await checkReducedMotion(browser, baseUrl, state);
    await checkNoJavaScript(browser, baseUrl, state);
    await checkMobile(browser, baseUrl, state);

    await check("all pages: no page, console, request or response errors", async () => {
      equal(state.errors.length, 0, `page/console errors: ${state.errors.join(" | ")}`);
      equal(state.external.length, 0, `external requests: ${state.external.join(" | ")}`);
      equal(state.failed.length, 0, `failed requests: ${state.failed.join(" | ")}`);
    });
  } finally {
    await browser?.close().catch(() => {});
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

main().catch((error) => {
  if (!error.reported) {
    console.error(`FAIL  ${currentCheck}: ${error.message}`);
  }
  process.exitCode = 1;
});
