import { readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "site-dist");
const baseUrl = "https://majorjohndoe.github.io/gridscalr";
const origin = "https://majorjohndoe.github.io";

const errors = [];
let checkedLinks = 0;
let checkedImages = 0;

const pages = [
  {
    file: "index.html",
    lang: "en",
    title: "GridScalr — PDF & TIF Takeoff for Drawings",
    description:
      "Measure PDF and TIF drawings locally. Calibrate plans, count doors, windows and fixtures, and export procurement quantities for facilities operations.",
    canonical: `${baseUrl}/`,
    titleTerms: ["pdf", "tif", "takeoff", "drawings"],
    h1Terms: ["pdf", "tif", "drawings", "local"],
    metaTerms: ["pdf", "tif", "drawings", "procurement quantities", "facilities operations"],
    bodyTerms: [
      "pdf takeoff",
      "pdf measurement",
      "tif/tiff drawings",
      "facilities operations",
      "property management",
      "door schedule",
      "procurement quantities",
    ],
  },
  {
    file: "sv/index.html",
    lang: "sv",
    title: "GridScalr — mängdning av PDF- och TIF-ritningar",
    description:
      "Mät och mängda PDF- och TIF-ritningar lokalt. Kalibrera planer, räkna dörrar, fönster och inventarier samt exportera inköpsunderlag för drift och förvaltning.",
    canonical: `${baseUrl}/sv/`,
    titleTerms: ["mängdning", "pdf", "tif", "ritningar"],
    h1Terms: ["pdf", "tif", "ritningar", "lokalt"],
    metaTerms: ["mängda", "pdf", "tif", "ritningar", "inköpsunderlag", "drift"],
    bodyTerms: [
      "mängdning",
      "pdf-mätning",
      "tif-ritningar",
      "drifttekniker",
      "tekniska förvaltare",
      "drift och underhåll",
      "inköpsunderlag",
    ],
  },
];

const hreflangExpected = {
  en: `${baseUrl}/`,
  sv: `${baseUrl}/sv/`,
  "x-default": `${baseUrl}/`,
};

const downloadUrl = "https://github.com/MajorJohnDoe/gridscalr/releases/latest";
const sourceUrl = "https://github.com/MajorJohnDoe/gridscalr#install-and-run";

const domCache = new Map();

const squash = (value) =>
  (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function exists(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

function pageUrl(file) {
  if (file === "index.html") return `${baseUrl}/`;
  if (file === "sv/index.html") return `${baseUrl}/sv/`;
  return `${baseUrl}/${file}`;
}

async function loadDocument(file) {
  if (domCache.has(file)) return domCache.get(file);
  const path = resolve(dist, file);
  if (!(await exists(path))) {
    errors.push(`Missing built page: ${relative(root, path)}`);
    return null;
  }
  const dom = new JSDOM(await readFile(path, "utf8"), { url: pageUrl(file) });
  domCache.set(file, dom);
  return dom;
}

function localTarget(raw, fromFile) {
  let url;
  try {
    url = new URL(raw, pageUrl(fromFile));
  } catch {
    return { invalid: raw };
  }
  if (url.origin !== origin) return { external: true, url: url.href };
  if (!url.pathname.startsWith("/gridscalr/")) return { invalid: raw };
  let path = decodeURIComponent(url.pathname.slice("/gridscalr/".length));
  if (path === "" || path.endsWith("/")) path += "index.html";
  return { path, hash: url.hash ? decodeURIComponent(url.hash.slice(1)) : "" };
}

async function checkLocalReference(raw, fromFile, context) {
  if (!raw || /^(mailto:|tel:|data:|javascript:)/i.test(raw)) return;
  const target = localTarget(raw, fromFile);
  if (target.external) return;
  if (target.invalid) {
    errors.push(`${fromFile}: ${context} has an invalid URL (${raw})`);
    return;
  }
  const absolute = resolve(dist, target.path);
  if (!absolute.startsWith(dist + sep)) {
    errors.push(`${fromFile}: ${context} points outside the built site (${raw})`);
    return;
  }
  if (!(await exists(absolute))) {
    errors.push(`${fromFile}: ${context} is missing ${target.path}`);
    return;
  }
  checkedLinks += 1;
  if (target.hash && extname(absolute) === ".html") {
    const doc = await loadDocument(target.path);
    if (doc && !doc.window.document.getElementById(target.hash)) {
      errors.push(
        `${fromFile}: ${context} links to missing anchor #${target.hash} in ${target.path}`,
      );
    }
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function textLength(value) {
  return [...value].length;
}

function checkTerms(value, terms, label, file) {
  const haystack = value.toLocaleLowerCase();
  for (const term of terms) {
    if (!haystack.includes(term.toLocaleLowerCase())) {
      errors.push(`${file}: ${label} does not contain the expected term "${term}"`);
    }
  }
}

function checkHead(doc, page, document) {
  const html = document.documentElement;
  assert(html.getAttribute("lang") === page.lang, `${page.file}: lang must be "${page.lang}"`);

  const titles = [...document.querySelectorAll("title")];
  assert(titles.length === 1, `${page.file}: must have exactly one <title>`);
  const title = squash(titles[0]?.textContent);
  assert(
    title.length >= 30 && title.length <= 60,
    `${page.file}: title is ${title.length} chars (expected 30–60)`,
  );
  assert(title === page.title, `${page.file}: title differs from the expected copy`);

  const descriptions = [...document.querySelectorAll('meta[name="description"]')];
  assert(descriptions.length === 1, `${page.file}: must have exactly one meta description`);
  const description = squash(descriptions[0]?.getAttribute("content"));
  assert(
    description.length >= 120 && description.length <= 160,
    `${page.file}: meta description is ${description.length} chars (expected 120–160)`,
  );
  assert(
    description === page.description,
    `${page.file}: meta description differs from the expected copy`,
  );

  const robots = document.querySelector('meta[name="robots"]');
  assert(
    robots && /index/i.test(robots.getAttribute("content") ?? ""),
    `${page.file}: meta robots must allow indexing`,
  );

  const canonicals = [...document.querySelectorAll('link[rel="canonical"]')];
  assert(canonicals.length === 1, `${page.file}: must have exactly one canonical link`);
  assert(
    canonicals[0]?.getAttribute("href") === page.canonical,
    `${page.file}: canonical must be ${page.canonical}`,
  );

  const alternates = new Map();
  for (const link of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
    alternates.set(link.getAttribute("hreflang"), link.getAttribute("href"));
  }
  for (const [lang, href] of Object.entries(hreflangExpected)) {
    assert(alternates.get(lang) === href, `${page.file}: hreflang="${lang}" must be ${href}`);
  }

  assert(
    document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    `${page.file}: missing og:title`,
  );
  assert(
    document.querySelector('meta[property="og:description"]')?.getAttribute("content"),
    `${page.file}: missing og:description`,
  );
  assert(
    document.querySelector('meta[property="og:url"]')?.getAttribute("content") === page.canonical,
    `${page.file}: og:url must match the canonical URL`,
  );
  assert(
    document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    `${page.file}: missing og:image`,
  );
  assert(
    document.querySelector('meta[property="og:image:alt"]')?.getAttribute("content"),
    `${page.file}: missing og:image:alt`,
  );
  assert(
    document.querySelector('meta[name="twitter:card"]')?.getAttribute("content") ===
      "summary_large_image",
    `${page.file}: missing or unexpected twitter:card`,
  );

  checkTerms(title, page.titleTerms, "title", page.file);
  checkTerms(description, page.metaTerms, "meta description", page.file);
  checkTerms(
    squash(document.querySelector("main")?.textContent),
    page.bodyTerms,
    "page copy",
    page.file,
  );

  const h1s = [...document.querySelectorAll("h1")];
  assert(h1s.length === 1, `${page.file}: must have exactly one h1 (found ${h1s.length})`);
  const h1 = squash(h1s[0]?.textContent);
  assert(h1.length > 0, `${page.file}: h1 must have text`);
  checkTerms(h1, page.h1Terms, "h1", page.file);

  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
  assert(headings[0]?.tagName === "H1", `${page.file}: the first heading must be h1`);
  assert(
    headings.filter((heading) => heading.tagName === "H2").length >= 3,
    `${page.file}: expected a usable h2 hierarchy`,
  );
  let previousLevel = 0;
  for (const heading of headings) {
    const level = Number(heading.tagName.slice(1));
    if (previousLevel && level > previousLevel + 1) {
      errors.push(
        `${page.file}: heading level jumps from h${previousLevel} to h${level} ("${squash(heading.textContent)}")`,
      );
    }
    previousLevel = level;
  }
}

function checkImages(doc, page) {
  const images = [...doc.querySelectorAll("img")];
  assert(images.length >= 4, `${page.file}: expected at least four screenshots`);

  const eager = images.filter((img) => img.getAttribute("fetchpriority") === "high");
  assert(eager.length === 1, `${page.file}: expected exactly one fetchpriority="high" hero image`);

  for (const img of images) {
    const alt = squash(img.getAttribute("alt"));
    if (!alt) errors.push(`${page.file}: image ${img.getAttribute("src")} has no alt text`);
    if (!img.getAttribute("width") || !img.getAttribute("height")) {
      errors.push(`${page.file}: image ${img.getAttribute("src")} is missing explicit dimensions`);
    }
    if (img !== eager[0] && img.getAttribute("loading") !== "lazy") {
      errors.push(`${page.file}: image ${img.getAttribute("src")} should be lazy-loaded`);
    }
    const src = img.getAttribute("src");
    if (/^(https?:)?\/\//i.test(src ?? "")) {
      errors.push(`${page.file}: external image is not allowed (${src})`);
    }
    checkedImages += 1;
  }
}

function checkLanguageSwitch(doc, page) {
  const nav = doc.querySelector("[data-lang-switch]");
  assert(nav, `${page.file}: missing language switch`);
  if (!nav) return;

  const links = [...nav.querySelectorAll("a[hreflang]")];
  assert(links.length === 2, `${page.file}: language switch must contain two language links`);

  const otherLang = page.lang === "en" ? "sv" : "en";
  const current = links.find((link) => link.getAttribute("hreflang") === page.lang);
  const other = links.find((link) => link.getAttribute("hreflang") === otherLang);

  assert(
    current?.getAttribute("aria-current") === "page",
    `${page.file}: the current language link needs aria-current="page"`,
  );
  assert(other, `${page.file}: the language switch is missing the ${otherLang} link`);

  if (other) {
    const target = localTarget(other.getAttribute("href"), page.file);
    const expected = otherLang === "en" ? "index.html" : "sv/index.html";
    assert(
      !target.external && !target.invalid && target.path === expected,
      `${page.file}: the ${otherLang} switch link must point to ${expected}`,
    );
  }
}

function checkJsonLd(doc, page) {
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  assert(scripts.length >= 2, `${page.file}: expected SoftwareApplication and FAQPage JSON-LD`);

  const documents = [];
  for (const script of scripts) {
    try {
      documents.push(JSON.parse(script.textContent));
    } catch (error) {
      errors.push(`${page.file}: JSON-LD does not parse (${error.message})`);
    }
  }

  const software = documents.find((entry) => entry["@type"] === "SoftwareApplication");
  assert(software, `${page.file}: missing SoftwareApplication JSON-LD`);
  if (software) {
    for (const field of [
      "name",
      "applicationCategory",
      "operatingSystem",
      "license",
      "description",
    ]) {
      assert(
        typeof software[field] === "string" && software[field].trim().length > 0,
        `${page.file}: SoftwareApplication is missing ${field}`,
      );
    }
    assert(
      software.offers?.price === "0",
      `${page.file}: SoftwareApplication should be free (price 0)`,
    );
    assert(
      Array.isArray(software.featureList) && software.featureList.length >= 4,
      `${page.file}: SoftwareApplication needs a feature list`,
    );
    assert(
      software.downloadUrl === downloadUrl,
      `${page.file}: SoftwareApplication downloadUrl must be the latest release`,
    );
  }

  const faqPage = documents.find((entry) => entry["@type"] === "FAQPage");
  assert(faqPage, `${page.file}: missing FAQPage JSON-LD`);
  if (!faqPage) return;

  const structured = new Map();
  for (const entry of faqPage.mainEntity ?? []) {
    const question = squash(entry.name);
    const answer = squash(entry.acceptedAnswer?.text);
    if (!question || !answer) {
      errors.push(`${page.file}: FAQ JSON-LD has an empty question or answer`);
      continue;
    }
    structured.set(question, answer);
  }

  const visible = new Map();
  for (const item of doc.querySelectorAll("details")) {
    const question = squash(item.querySelector("summary")?.textContent);
    const answer = squash(item.querySelector("p")?.textContent);
    if (question && answer) visible.set(question, answer);
  }

  assert(visible.size >= 5, `${page.file}: expected at least five visible FAQ entries`);
  assert(
    structured.size === visible.size,
    `${page.file}: FAQ JSON-LD has ${structured.size} entries but ${visible.size} are visible`,
  );

  for (const [question, answer] of visible) {
    if (!structured.has(question)) {
      errors.push(`${page.file}: FAQ JSON-LD is missing the visible question "${question}"`);
      continue;
    }
    if (structured.get(question) !== answer) {
      errors.push(
        `${page.file}: FAQ JSON-LD answer does not match the visible answer for "${question}"`,
      );
    }
  }
}

async function checkReferenceSafety(doc, page) {
  for (const element of doc.querySelectorAll("[href]")) {
    if (element.tagName === "LINK" || element.tagName === "A") {
      await checkLocalReference(
        element.getAttribute("href"),
        page.file,
        `<${element.tagName.toLowerCase()}>`,
      );
    }
  }
  for (const element of doc.querySelectorAll("[src]")) {
    if (element.tagName === "IMG" || element.tagName === "SCRIPT") {
      await checkLocalReference(
        element.getAttribute("src"),
        page.file,
        `<${element.tagName.toLowerCase()}>`,
      );
    }
  }

  for (const script of doc.querySelectorAll("script[src]")) {
    const target = localTarget(script.getAttribute("src"), page.file);
    if (target.external)
      errors.push(`${page.file}: external script is not allowed (${script.getAttribute("src")})`);
  }
  for (const script of doc.querySelectorAll("script:not([src])")) {
    if (script.getAttribute("type") !== "application/ld+json") {
      errors.push(`${page.file}: unexpected inline executable script`);
    }
  }
  for (const link of doc.querySelectorAll('link[rel~="stylesheet"], link[rel="preload"]')) {
    const target = localTarget(link.getAttribute("href"), page.file);
    if (target.external) {
      errors.push(
        `${page.file}: external stylesheet or preload is not allowed (${link.getAttribute("href")})`,
      );
    }
  }
  for (const img of doc.querySelectorAll("img")) {
    const raw = img.getAttribute("src") ?? "";
    if (raw.startsWith("//")) errors.push(`${page.file}: external image is not allowed (${raw})`);
  }
  assert(doc.querySelectorAll("iframe").length === 0, `${page.file}: iframes are not allowed`);
}

async function checkSitemapAndRobots() {
  const sitemapPath = resolve(dist, "sitemap.xml");
  const robotsPath = resolve(dist, "robots.txt");
  assert(await exists(sitemapPath), "site-dist: missing sitemap.xml");
  assert(await exists(robotsPath), "site-dist: missing robots.txt");

  if (await exists(sitemapPath)) {
    const sitemap = await readFile(sitemapPath, "utf8");
    for (const href of [hreflangExpected.en, hreflangExpected.sv]) {
      assert(sitemap.includes(`<loc>${href}</loc>`), `sitemap.xml: missing <loc>${href}</loc>`);
    }
    for (const [lang, href] of Object.entries(hreflangExpected)) {
      assert(
        sitemap.includes(`hreflang="${lang}" href="${href}"`),
        `sitemap.xml: missing ${lang} alternate`,
      );
    }
  }

  if (await exists(robotsPath)) {
    const robots = await readFile(robotsPath, "utf8");
    assert(robots.includes(`Sitemap: ${baseUrl}/sitemap.xml`), "robots.txt: missing sitemap URL");
  }
}

async function check404() {
  const doc = await loadDocument("404.html");
  if (!doc) return;
  const document = doc.window.document;
  const robots = document.querySelector('meta[name="robots"]');
  assert(
    robots && /noindex/i.test(robots.getAttribute("content") ?? ""),
    "404.html: must be marked noindex",
  );
  assert(document.querySelectorAll("h1").length === 1, "404.html: must have exactly one h1");
  assert(
    document.querySelector('a[href="/gridscalr/sv/"]') &&
      document.querySelector('a[href="/gridscalr/"]'),
    "404.html: must link to both language pages",
  );
  await checkReferenceSafety(document, { file: "404.html" });
}

async function checkAssets() {
  const cssPath = resolve(dist, "assets/site.css");
  const jsPath = resolve(dist, "assets/site.js");
  assert(await exists(cssPath), "site-dist: missing assets/site.css");
  assert(await exists(jsPath), "site-dist: missing assets/site.js");

  if (await exists(cssPath)) {
    const css = await readFile(cssPath, "utf8");
    assert(!/@import/i.test(css), "site.css: @import is not allowed");
    assert(!/@font-face/i.test(css), "site.css: external or custom fonts are not allowed");
    assert(!/url\(\s*['"]?https?:/i.test(css), "site.css: external asset URLs are not allowed");
  }

  if (await exists(jsPath)) {
    const js = await readFile(jsPath, "utf8");
    for (const pattern of [
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
      "sendBeacon",
      "document.cookie",
    ]) {
      assert(!js.includes(pattern), `site.js: network or storage call is not allowed (${pattern})`);
    }
  }

  assert(
    await exists(resolve(dist, "social-preview.png")),
    "site-dist: missing social-preview.png",
  );
  assert(await exists(resolve(dist, "screenshots/hero.png")), "site-dist: missing hero screenshot");
}

function checkNoTrackers() {
  for (const page of [...pages, { file: "404.html" }]) {
    const doc = domCache.get(page.file)?.window.document;
    if (!doc) continue;
    const html = doc.documentElement.outerHTML.toLowerCase();
    for (const tracker of [
      "googletagmanager",
      "google-analytics",
      "gtag(",
      "plausible.io",
      "matomo",
      "hotjar",
      "doubleclick",
      "facebook.net",
    ]) {
      if (html.includes(tracker))
        errors.push(`${page.file}: possible third-party tracker (${tracker})`);
    }
  }
}

await checkSitemapAndRobots();
await checkAssets();

const pageData = [];
for (const page of pages) {
  const doc = await loadDocument(page.file);
  if (!doc) continue;
  const document = doc.window.document;
  pageData.push({ page, document });

  checkHead(document, page, document);
  checkImages(document, page);
  checkLanguageSwitch(document, page);
  checkJsonLd(document, page);
  await checkReferenceSafety(document, page);
}

// Compare parity between the two hand-maintained pages.
if (pageData.length === 2) {
  const [first, second] = pageData;
  const sectionIds = (document) =>
    [...document.querySelectorAll("main section[id]")]
      .map((section) => section.id)
      .sort()
      .join(",");
  assert(
    sectionIds(first.document) === sectionIds(second.document),
    `Section IDs differ between ${first.page.file} and ${second.page.file}`,
  );

  for (const attribute of ["data-download", "data-build-from-source"]) {
    const firstHrefs = [...first.document.querySelectorAll(`[${attribute}]`)].map((a) => a.href);
    const secondHrefs = [...second.document.querySelectorAll(`[${attribute}]`)].map((a) => a.href);
    assert(
      firstHrefs.length > 0 && firstHrefs.join("|") === secondHrefs.join("|"),
      `${attribute} links differ between ${first.page.file} and ${second.page.file}`,
    );
  }

  for (const document of [first.document, second.document]) {
    for (const link of document.querySelectorAll("[data-download]")) {
      assert(
        link.getAttribute("href") === downloadUrl,
        "Download link must point to the latest release",
      );
    }
    for (const link of document.querySelectorAll("[data-build-from-source]")) {
      assert(
        link.getAttribute("href") === sourceUrl,
        "Build-from-source link must point to the install section",
      );
    }
  }

  const titles = new Set(pages.map((page) => page.title));
  const descriptions = new Set(pages.map((page) => page.description));
  assert(titles.size === pages.length, "Each language must have a unique title");
  assert(descriptions.size === pages.length, "Each language must have a unique meta description");
  assert(first.page.title !== second.page.title, "The English and Swedish titles must be unique");
}

await check404();
checkNoTrackers();

if (errors.length) {
  console.error(`Site check failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log(
  `Site check passed: ${pages.length} language pages, ${checkedLinks} local references, ${checkedImages} images, FAQ JSON-LD, sitemap and 404.`,
);
