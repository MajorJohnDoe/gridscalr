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

const pairUrls = {
  home: {
    en: `${baseUrl}/`,
    sv: `${baseUrl}/sv/`,
    "x-default": `${baseUrl}/`,
  },
  features: {
    en: `${baseUrl}/features/`,
    sv: `${baseUrl}/sv/funktioner/`,
    "x-default": `${baseUrl}/features/`,
  },
};

const pages = [
  {
    file: "index.html",
    lang: "en",
    kind: "home",
    pair: "home",
    canonical: pairUrls.home.en,
    title: "GridScalr — PDF & TIF Takeoff for Drawings",
    description:
      "Measure PDF and TIF drawings locally. Calibrate plans, count doors, windows and fixtures, and export procurement quantities for facilities operations.",
    titleTerms: ["pdf", "tif", "takeoff", "drawings"],
    h1Terms: ["pdf", "tif", "procurement quantities", "local"],
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
    kind: "home",
    pair: "home",
    canonical: pairUrls.home.sv,
    title: "GridScalr — mängdning av PDF- och TIF-ritningar",
    description:
      "Mät och mängda PDF- och TIF-ritningar lokalt. Kalibrera planer, räkna dörrar, fönster och inventarier samt exportera inköpsunderlag för drift och förvaltning.",
    titleTerms: ["mängdning", "pdf", "tif", "ritningar"],
    h1Terms: ["pdf", "tif", "inköpsunderlag", "lokalt"],
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
  {
    file: "features/index.html",
    lang: "en",
    kind: "features",
    pair: "features",
    canonical: pairUrls.features.en,
    title: "GridScalr features — PDF takeoff, counts and exports",
    description:
      "Explore GridScalr features: calibration, measurement, custom counts, count schedules, revision comparison, local OCR and CSV, Excel and PDF exports.",
    titleTerms: ["pdf", "takeoff", "counts", "exports"],
    h1Terms: ["pdf takeoff", "tif", "feature"],
    metaTerms: ["calibration", "count schedule", "revision comparison", "ocr", "pdf"],
    bodyTerms: [
      "pdf takeoff",
      "count schedule",
      "revision comparison",
      "local ocr",
      "procurement quantities",
      "tif",
    ],
  },
  {
    file: "sv/funktioner/index.html",
    lang: "sv",
    kind: "features",
    pair: "features",
    canonical: pairUrls.features.sv,
    title: "Funktioner i GridScalr — mängdning av PDF och TIF",
    description:
      "Utforska GridScalr: kalibrering, längd- och areamätning, egna count-typer, Count schedule, revisionsjämförelse, lokal OCR samt export till CSV, Excel och PDF.",
    titleTerms: ["funktioner", "mängdning", "pdf", "tif"],
    h1Terms: ["funktioner", "mängdning", "pdf", "tif"],
    metaTerms: ["kalibrering", "count schedule", "revisionsjämförelse", "ocr", "pdf"],
    bodyTerms: [
      "mängdning",
      "count schedule",
      "revisionsjämförelse",
      "lokal ocr",
      "inköpsunderlag",
      "tif",
    ],
  },
];

const downloadUrl = `${baseUrl}/`;
const sourceUrl = "https://github.com/MajorJohnDoe/gridscalr#install-and-run";

const domCache = new Map();
const rawCache = new Map();

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
  const found = pages.find((page) => page.file === file);
  if (found) return found.canonical;
  return `${baseUrl}/${file}`;
}

async function loadDocument(file) {
  if (domCache.has(file)) return domCache.get(file);
  const path = resolve(dist, file);
  if (!(await exists(path))) {
    errors.push(`Missing built page: ${relative(root, path)}`);
    return null;
  }
  const html = await readFile(path, "utf8");
  rawCache.set(file, html);
  const dom = new JSDOM(html, { url: pageUrl(file) });
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

function checkTerms(value, terms, label, file) {
  const haystack = value.toLocaleLowerCase();
  for (const term of terms) {
    if (!haystack.includes(term.toLocaleLowerCase())) {
      errors.push(`${file}: ${label} does not contain the expected term "${term}"`);
    }
  }
}

function checkHead(document, page, release) {
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
  for (const [lang, href] of Object.entries(pairUrls[page.pair])) {
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

  assert(document.querySelector('link[rel="icon"]'), `${page.file}: missing favicon link`);
  assert(
    document.querySelector('link[rel="apple-touch-icon"]'),
    `${page.file}: missing apple-touch-icon`,
  );

  const versionNodes = [...document.querySelectorAll("[data-release-version]")];
  assert(versionNodes.length > 0, `${page.file}: missing the release version`);
  for (const node of versionNodes) {
    assert(
      squash(node.textContent) === release.version,
      `${page.file}: displayed release version must be ${release.version}`,
    );
  }

  const raw = rawCache.get(page.file) ?? "";
  assert(!raw.includes("{{"), `${page.file}: unresolved release token`);

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

function checkImages(document, page) {
  const images = [...document.querySelectorAll("img")];
  const minimum = page.kind === "home" ? 6 : 12;
  assert(images.length >= minimum, `${page.file}: expected at least ${minimum} images`);

  const eager = images.filter((img) => img.getAttribute("fetchpriority") === "high");
  assert(
    eager.length === (page.kind === "home" ? 1 : 0),
    `${page.file}: expected ${page.kind === "home" ? "one" : "no"} fetchpriority="high" image`,
  );

  for (const img of images) {
    const decorative = img.getAttribute("aria-hidden") === "true";
    const alt = squash(img.getAttribute("alt"));
    if (!decorative && !alt) {
      errors.push(`${page.file}: image ${img.getAttribute("src")} has no alt text`);
    }
    if (!img.getAttribute("width") || !img.getAttribute("height")) {
      errors.push(`${page.file}: image ${img.getAttribute("src")} is missing explicit dimensions`);
    }
    if (!decorative && img !== eager[0] && img.getAttribute("loading") !== "lazy") {
      errors.push(`${page.file}: image ${img.getAttribute("src")} should be lazy-loaded`);
    }
    const src = img.getAttribute("src");
    if (/^(https?:)?\/\//i.test(src ?? "")) {
      errors.push(`${page.file}: external image is not allowed (${src})`);
    }
    checkedImages += 1;
  }

  const lightboxTriggers = [...document.querySelectorAll("[data-lightbox]")];
  const minimumShots = page.kind === "home" ? 5 : 14;
  assert(
    lightboxTriggers.length >= minimumShots,
    `${page.file}: expected at least ${minimumShots} lightbox screenshots`,
  );
  for (const trigger of lightboxTriggers) {
    const href = trigger.getAttribute("href") ?? "";
    const inner = trigger.querySelector("img");
    assert(inner, `${page.file}: lightbox trigger ${href} has no image`);
    assert(
      inner && (inner.getAttribute("src") ?? "").split("/").pop() === href.split("/").pop(),
      `${page.file}: lightbox trigger ${href} must point to its own image`,
    );
  }
}

function checkLanguageSwitch(document, page) {
  const nav = document.querySelector("[data-lang-switch]");
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
    const expected = pages.find(
      (candidate) => candidate.lang === otherLang && candidate.pair === page.pair,
    );
    const target = localTarget(other.getAttribute("href"), page.file);
    assert(
      expected && !target.external && !target.invalid && target.path === expected.file,
      `${page.file}: the ${otherLang} switch link must point to ${expected?.file}`,
    );
  }
}

function checkRelease(document, page, release) {
  const expectedAttributes = {
    "data-installer": release.installerUrl,
    "data-release-page": release.releaseUrl,
  };
  for (const [attribute, expected] of Object.entries(expectedAttributes)) {
    const nodes = [...document.querySelectorAll(`[${attribute}]`)];
    assert(nodes.length > 0, `${page.file}: missing ${attribute}`);
    for (const node of nodes) {
      assert(
        node.getAttribute("href") === expected,
        `${page.file}: ${attribute} must be ${expected}`,
      );
    }
  }

  if (page.kind === "home") {
    const extra = {
      "data-msi": release.msiUrl,
      "data-portable": release.portableUrl,
      "data-checksums": release.checksumsUrl,
    };
    for (const [attribute, expected] of Object.entries(extra)) {
      const nodes = [...document.querySelectorAll(`[${attribute}]`)];
      assert(nodes.length === 1, `${page.file}: expected exactly one ${attribute}`);
      assert(
        nodes[0]?.getAttribute("href") === expected,
        `${page.file}: ${attribute} must be ${expected}`,
      );
    }
  }

  for (const link of document.querySelectorAll("[data-build-from-source]")) {
    assert(
      link.getAttribute("href") === sourceUrl,
      `${page.file}: build-from-source link must point to the install section`,
    );
  }

  for (const link of document.querySelectorAll("[href]")) {
    const href = link.getAttribute("href") ?? "";
    if (/releases\/download/.test(href)) {
      assert(
        href.includes(`v${release.version}`),
        `${page.file}: asset URL must use ${release.tag}`,
      );
      assert(href.includes(release.version), `${page.file}: asset URL must include the version`);
    }
  }
}

function checkJsonLd(document, page, release) {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
  assert(scripts.length >= 2, `${page.file}: expected structured data`);

  const documents = [];
  for (const script of scripts) {
    try {
      documents.push(JSON.parse(script.textContent));
    } catch (error) {
      errors.push(`${page.file}: JSON-LD does not parse (${error.message})`);
    }
  }

  if (page.kind === "home") {
    const software = documents.find((entry) => entry["@type"] === "SoftwareApplication");
    assert(software, `${page.file}: missing SoftwareApplication JSON-LD`);
    if (software) {
      for (const field of [
        "name",
        "applicationCategory",
        "operatingSystem",
        "license",
        "description",
        "softwareVersion",
      ]) {
        assert(
          typeof software[field] === "string" && software[field].trim().length > 0,
          `${page.file}: SoftwareApplication is missing ${field}`,
        );
      }
      assert(
        software.softwareVersion === release.version,
        `${page.file}: softwareVersion must be ${release.version}`,
      );
      assert(
        software.offers?.price === "0",
        `${page.file}: SoftwareApplication should be free (price 0)`,
      );
      assert(
        Array.isArray(software.featureList) && software.featureList.length >= 4,
        `${page.file}: SoftwareApplication needs a feature list`,
      );
      assert(
        software.downloadUrl === release.releaseUrl,
        `${page.file}: SoftwareApplication downloadUrl must be the release URL`,
      );
      assert(
        software.releaseNotes === release.notesUrl,
        `${page.file}: SoftwareApplication releaseNotes must be the notes URL`,
      );
    }

    const faqPage = documents.find((entry) => entry["@type"] === "FAQPage");
    assert(faqPage, `${page.file}: missing FAQPage JSON-LD`);
    if (faqPage) {
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
      for (const item of document.querySelectorAll("#faq details")) {
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
  } else {
    const webpage = documents.find((entry) => entry["@type"] === "WebPage");
    assert(webpage, `${page.file}: missing WebPage JSON-LD`);
    assert(webpage?.url === page.canonical, `${page.file}: WebPage URL must match the canonical`);
    assert(
      webpage?.inLanguage === page.lang,
      `${page.file}: WebPage language must be ${page.lang}`,
    );

    const breadcrumb = documents.find((entry) => entry["@type"] === "BreadcrumbList");
    assert(breadcrumb, `${page.file}: missing BreadcrumbList JSON-LD`);
    const items = breadcrumb?.itemListElement ?? [];
    assert(items.length >= 2, `${page.file}: breadcrumb needs at least two items`);
    assert(
      items[items.length - 1]?.item === page.canonical,
      `${page.file}: breadcrumb must end at the canonical URL`,
    );
  }
}

async function checkReferenceSafety(document, page) {
  for (const element of document.querySelectorAll("[href]")) {
    if (element.tagName === "LINK" || element.tagName === "A") {
      await checkLocalReference(
        element.getAttribute("href"),
        page.file,
        `<${element.tagName.toLowerCase()}>`,
      );
    }
  }
  for (const element of document.querySelectorAll("[src]")) {
    if (element.tagName === "IMG" || element.tagName === "SCRIPT") {
      await checkLocalReference(
        element.getAttribute("src"),
        page.file,
        `<${element.tagName.toLowerCase()}>`,
      );
    }
  }

  for (const script of document.querySelectorAll("script[src]")) {
    const target = localTarget(script.getAttribute("src"), page.file);
    if (target.external) {
      errors.push(`${page.file}: external script is not allowed (${script.getAttribute("src")})`);
    }
  }
  for (const script of document.querySelectorAll("script:not([src])")) {
    if (script.getAttribute("type") !== "application/ld+json") {
      errors.push(`${page.file}: unexpected inline executable script`);
    }
  }
  for (const link of document.querySelectorAll('link[rel~="stylesheet"], link[rel="preload"]')) {
    const target = localTarget(link.getAttribute("href"), page.file);
    if (target.external) {
      errors.push(
        `${page.file}: external stylesheet or preload is not allowed (${link.getAttribute("href")})`,
      );
    }
  }
  for (const img of document.querySelectorAll("img")) {
    const raw = img.getAttribute("src") ?? "";
    if (raw.startsWith("//")) errors.push(`${page.file}: external image is not allowed (${raw})`);
  }
  assert(document.querySelectorAll("iframe").length === 0, `${page.file}: iframes are not allowed`);
}

async function checkSitemapAndRobots() {
  const sitemapPath = resolve(dist, "sitemap.xml");
  const robotsPath = resolve(dist, "robots.txt");
  assert(await exists(sitemapPath), "site-dist: missing sitemap.xml");
  assert(await exists(robotsPath), "site-dist: missing robots.txt");

  if (await exists(sitemapPath)) {
    const sitemap = await readFile(sitemapPath, "utf8");
    for (const urls of Object.values(pairUrls)) {
      for (const [lang, href] of Object.entries(urls)) {
        assert(
          sitemap.includes(`hreflang="${lang}" href="${href}"`),
          `sitemap.xml: missing ${lang} alternate ${href}`,
        );
      }
      for (const href of new Set(Object.values(urls))) {
        assert(sitemap.includes(`<loc>${href}</loc>`), `sitemap.xml: missing <loc>${href}</loc>`);
      }
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
      document.querySelector('a[href="/gridscalr/"]') &&
      document.querySelector('a[href="/gridscalr/features/"]'),
    "404.html: must link to both languages and the features page",
  );
  assert(document.querySelector('link[rel="icon"]'), "404.html: missing favicon link");
  await checkReferenceSafety(document, { file: "404.html" });
}

async function checkAssets() {
  const cssPath = resolve(dist, "assets/site.css");
  const jsPath = resolve(dist, "assets/site.js");
  for (const path of [
    cssPath,
    jsPath,
    resolve(dist, "assets/app-icon.svg"),
    resolve(dist, "assets/favicon.ico"),
    resolve(dist, "assets/app-icon-128.png"),
    resolve(dist, "social-preview.png"),
    resolve(dist, "screenshots/hero.png"),
    resolve(dist, "screenshots/calibration.png"),
    resolve(dist, "screenshots/images.png"),
  ]) {
    assert(await exists(path), `site-dist: missing ${relative(dist, path)}`);
  }

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

function checkPairParity(pageData) {
  for (const pair of ["home", "features"]) {
    const pairPages = pageData.filter((entry) => entry.page.pair === pair);
    if (pairPages.length !== 2) {
      errors.push(`Expected two pages for the ${pair} pair`);
      continue;
    }
    const [first, second] = pairPages;
    const sectionIds = (document) =>
      [...document.querySelectorAll("main section[id]")]
        .map((section) => section.id)
        .sort()
        .join(",");
    assert(
      sectionIds(first.document) === sectionIds(second.document),
      `Section IDs differ between ${first.page.file} and ${second.page.file}`,
    );

    for (const attribute of [
      "data-installer",
      "data-release-page",
      "data-build-from-source",
      "data-msi",
      "data-portable",
      "data-checksums",
    ]) {
      const firstHrefs = [...first.document.querySelectorAll(`[${attribute}]`)]
        .map((node) => node.href)
        .sort()
        .join("|");
      const secondHrefs = [...second.document.querySelectorAll(`[${attribute}]`)]
        .map((node) => node.href)
        .sort()
        .join("|");
      assert(
        firstHrefs === secondHrefs,
        `${attribute} links differ between ${first.page.file} and ${second.page.file}`,
      );
    }
  }
}

const releasePath = resolve(root, "site/release.json");
assert(await exists(releasePath), "site/release.json is missing");
let release = {};
if (await exists(releasePath)) {
  try {
    release = JSON.parse(await readFile(releasePath, "utf8"));
  } catch (error) {
    errors.push(`site/release.json does not parse (${error.message})`);
  }
}
assert(/^\d+\.\d+\.\d+$/.test(release.version ?? ""), "release.json: invalid version");
assert(release.tag === `v${release.version}`, "release.json: tag must match the version");
assert(
  /^\d{4}-\d{2}-\d{2}$/.test(release.releasedAt ?? ""),
  "release.json: releasedAt must be an ISO date",
);
assert(
  release.releaseUrl?.endsWith(`/releases/tag/${release.tag}`),
  "release.json: releaseUrl must point to the tag",
);
assert(
  release.installerUrl?.includes(`/download/${release.tag}/`),
  "release.json: installerUrl must point to the release asset",
);
assert(
  release.installerUrl?.includes(release.version),
  "release.json: installerUrl must include the version",
);
for (const field of ["notesUrl", "msiUrl", "portableUrl", "checksumsUrl", "latestUrl"]) {
  assert(
    typeof release[field] === "string" && release[field].startsWith("https://"),
    `release.json: ${field} must be an HTTPS URL`,
  );
}

await checkSitemapAndRobots();
await checkAssets();

const pageData = [];
for (const page of pages) {
  const doc = await loadDocument(page.file);
  if (!doc) continue;
  const document = doc.window.document;
  pageData.push({ page, document });

  checkHead(document, page, release);
  checkImages(document, page);
  checkLanguageSwitch(document, page);
  checkRelease(document, page, release);
  checkJsonLd(document, page, release);
  await checkReferenceSafety(document, page);
}

if (pageData.length === pages.length) {
  checkPairParity(pageData);

  const titles = new Set(pages.map((page) => page.title));
  const descriptions = new Set(pages.map((page) => page.description));
  assert(titles.size === pages.length, "Each page must have a unique title");
  assert(descriptions.size === pages.length, "Each page must have a unique meta description");
}

await check404();
checkNoTrackers();

if (errors.length) {
  console.error(`Site check failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log(
  `Site check passed: ${pages.length} pages, GridScalr ${release.version}, ${checkedLinks} local references, ${checkedImages} images, release metadata, structured data, sitemap and 404.`,
);
