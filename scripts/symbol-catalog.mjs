import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outputDir = resolve(root, "artifacts");
const output = resolve(outputDir, "symbol-catalog.html");

const en = JSON.parse(await readFile(resolve(root, "src/i18n/locales/en.json"), "utf8"));
const sv = JSON.parse(await readFile(resolve(root, "src/i18n/locales/sv.json"), "utf8"));

// Load the same TypeScript registry the app uses, so the catalogue cannot drift
// from the canvas, library and PDF export.
const server = await createServer({
  root,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
let registry;
try {
  registry = await server.ssrLoadModule("/src/features/schematics/symbols/registry.ts");
} finally {
  await server.close();
}

const { SYMBOLS, SIGN_CATEGORIES, SCHEMATIC_CATEGORIES, SYMBOL_CATEGORY_COLORS, symbolSvgMarkup } =
  registry;

const categoryOrder = [...SIGN_CATEGORIES, ...SCHEMATIC_CATEGORIES];
const categoryLabel = (id, locale) => (locale === "sv" ? sv : en)[`symbolCategory.${id}`] ?? id;
const setLabel = (set, locale) =>
  set === "schematic"
    ? locale === "sv"
      ? "Driftkort"
      : "Schematic"
    : locale === "sv"
      ? "Skyltar"
      : "Signs";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const symbolLocales = new Map();
for (const symbol of SYMBOLS) {
  const nameKey = `symbol.${symbol.id}`;
  symbolLocales.set(symbol.id, {
    en: en[nameKey] ?? symbol.name,
    sv: sv[nameKey] ?? symbol.name,
  });
}

const setOrder = { sign: 0, schematic: 1 };
const sortedSymbols = [...SYMBOLS].sort((a, b) => {
  const set = (setOrder[a.set ?? "sign"] ?? 0) - (setOrder[b.set ?? "sign"] ?? 0);
  if (set !== 0) return set;
  const category = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  if (category !== 0) return category;
  return a.id.localeCompare(b.id);
});

function portsMarkup(symbol) {
  if (!symbol.ports?.length) return "";
  return `<g class="ports">${symbol.ports
    .map(
      (port) =>
        `<circle cx="${port.x}" cy="${port.y}" r="2.2" data-port="${escapeHtml(port.id)}"><title>${escapeHtml(port.id)}${port.direction ? ` · ${port.direction}` : ""}</title></circle>`,
    )
    .join("")}</g>`;
}

function previewMarkup(symbol, size) {
  const style = symbol.style ?? "sign";
  const color =
    style === "schematic" ? "#111111" : (SYMBOL_CATEGORY_COLORS[symbol.category] ?? "#334155");
  const svg = symbolSvgMarkup(symbol, size, color, style);
  return svg.replace(
    "</svg>",
    `${portsMarkup(symbol).replace('<g class="ports">', '<g class="ports">')}</svg>`,
  );
}

function cardMarkup(symbol) {
  const style = symbol.style ?? "sign";
  const actual = Math.round((symbol.defaultSize ?? 24) * (4 / 3) * 100) / 100;
  const name = symbolLocales.get(symbol.id);
  const keywords = symbol.keywords.join(" ");
  const ports = (symbol.ports ?? []).length;
  const search = [symbol.id, name.en, name.sv, keywords, symbol.category, symbol.tagPrefix ?? ""]
    .join(" ")
    .toLocaleLowerCase();
  return `
  <article class="card" id="symbol-${escapeHtml(symbol.id)}" data-symbol="${escapeHtml(symbol.id)}" data-set="${style === "schematic" ? "schematic" : "sign"}" data-category="${escapeHtml(symbol.category)}" data-search="${escapeHtml(search)}">
    <div class="card-head">
      <span class="category-chip" style="--chip:${SYMBOL_CATEGORY_COLORS[symbol.category] ?? "#334155"}">${escapeHtml(categoryLabel(symbol.category, "en"))}</span>
      <a class="anchor" href="#symbol-${escapeHtml(symbol.id)}" aria-label="Link to ${escapeHtml(symbol.id)}">#</a>
    </div>
    <div class="previews">
      <figure>
        <div class="preview-large">${previewMarkup(symbol, 112)}</div>
        <figcaption>Large</figcaption>
      </figure>
      <figure>
        <div class="preview-actual" style="min-height:${Math.max(34, actual + 10)}px">${previewMarkup(symbol, actual)}</div>
        <figcaption>Actual · ${symbol.defaultSize ?? 24} pt</figcaption>
      </figure>
    </div>
    <h3>
      <span data-locale="sv">${escapeHtml(name.sv)}</span>
      <span data-locale="en">${escapeHtml(name.en)}</span>
    </h3>
    <dl>
      <dt>ID</dt><dd><code>${escapeHtml(symbol.id)}</code></dd>
      <dt data-locale="sv">Prefix</dt><dt data-locale="en">Prefix</dt><dd>${escapeHtml(symbol.tagPrefix ?? "—")}</dd>
      <dt data-locale="sv">Portar</dt><dt data-locale="en">Ports</dt><dd>${ports}</dd>
      <dt data-locale="sv">Nyckelord</dt><dt data-locale="en">Keywords</dt><dd class="keywords">${escapeHtml(keywords)}</dd>
    </dl>
    <label class="review">
      <span data-locale="sv">Granskning</span><span data-locale="en">Review</span>
      <select data-review="${escapeHtml(symbol.id)}">
        <option value="unreviewed">Unreviewed</option>
        <option value="approved">Approved</option>
        <option value="change">Change requested</option>
      </select>
    </label>
  </article>`;
}

const grouped = categoryOrder
  .map((category) => {
    const items = sortedSymbols.filter((symbol) => symbol.category === category);
    if (!items.length) return "";
    return `
  <section class="group" id="category-${escapeHtml(category)}" data-category="${escapeHtml(category)}">
    <h2><span class="group-dot" style="--chip:${SYMBOL_CATEGORY_COLORS[category] ?? "#334155"}"></span><span data-locale="sv">${escapeHtml(categoryLabel(category, "sv"))}</span><span data-locale="en">${escapeHtml(categoryLabel(category, "en"))}</span></h2>
    <div class="grid">${items.map(cardMarkup).join("")}</div>
  </section>`;
  })
  .join("");

const nav = categoryOrder
  .map((category) => {
    const count = sortedSymbols.filter((symbol) => symbol.category === category).length;
    if (!count) return "";
    return `<a href="#category-${escapeHtml(category)}"><span data-locale="sv">${escapeHtml(categoryLabel(category, "sv"))}</span><span data-locale="en">${escapeHtml(categoryLabel(category, "en"))}</span><b>${count}</b></a>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GridScalr symbolkatalog · symbol catalogue</title>
<style>
:root{color-scheme:light;--ink:#1a2024;--muted:#5b6870;--line:#d7dee2;--soft:#edf1f3;--paper:#fff;--accent:#0f766e}
*{box-sizing:border-box}
body{margin:0;background:#f3f6f7;color:var(--ink);font:14px/1.45 "Segoe UI",system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);padding:16px 24px}
h1{margin:0 0 4px;font-size:20px}
.sub{margin:0;color:var(--muted);font-size:12px}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.toolbar input{min-width:240px;flex:1 1 280px;padding:7px 10px;border:1px solid var(--line);border-radius:7px;font:inherit}
.toolbar button{padding:7px 10px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);font:inherit;cursor:pointer}
.toolbar button.is-active{background:var(--accent);border-color:var(--accent);color:#fff}
.toolbar label{display:flex;gap:6px;align-items:center;color:var(--muted);font-size:12px}
.layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px;padding:20px 24px 60px;max-width:1500px;margin:0 auto}
nav{position:sticky;top:112px;align-self:start;display:flex;flex-direction:column;gap:3px;max-height:calc(100vh - 140px);overflow:auto}
nav a{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:6px;color:var(--muted);text-decoration:none;font-size:12px}
nav a:hover{background:#fff;color:var(--ink)}
nav b{font-weight:600}
main{min-width:0}
.group{margin:0 0 26px}
.group h2{display:flex;gap:8px;align-items:center;margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:6px}
.group-dot,.category-chip{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--chip)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;break-inside:avoid}
.card[hidden]{display:none}
.card-head{display:flex;justify-content:space-between;align-items:center}
.category-chip{width:auto;height:auto;border-radius:99px;padding:2px 7px;background:color-mix(in srgb,var(--chip) 14%,#fff);color:var(--chip);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.anchor{color:var(--muted);text-decoration:none;font-size:12px}
.previews{display:flex;gap:8px;align-items:flex-end;margin:6px 0 4px;min-height:124px}
.previews figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:2px}
.previews figcaption{color:var(--muted);font-size:10px}
.preview-large{display:flex;align-items:center;justify-content:center;width:124px;min-height:124px;border:1px dashed var(--line);border-radius:8px;background:var(--soft)}
.preview-actual{display:flex;align-items:center;justify-content:center;min-width:54px;border:1px dashed var(--line);border-radius:8px;padding:4px}
.card h3{margin:6px 0 6px;font-size:14px;line-height:1.2}
.card h3 span{display:none}
html[lang="sv"] .card h3 [data-locale="sv"],html[lang="en"] .card h3 [data-locale="en"]{display:inline}
dl{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:0 0 8px;font-size:11px}
dt{color:var(--muted)}
dd{margin:0;overflow-wrap:anywhere}
.keywords{font-size:10px;color:var(--muted)}
.review{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:11px;color:var(--muted);border-top:1px solid var(--soft);padding-top:7px}
.review select{font:inherit;font-size:11px;padding:3px 5px;border:1px solid var(--line);border-radius:5px;background:#fff}
body:not(.show-ports) .ports{display:none}
.ports circle{fill:#fff;stroke:#c0392b;stroke-width:2}
[data-locale]{display:none}
html[lang="sv"] [data-locale="sv"],html[lang="en"] [data-locale="en"]{display:inline}
nav [data-locale]{display:none}
html[lang="sv"] nav [data-locale="sv"],html[lang="en"] nav [data-locale="en"]{display:inline}
.group h2 [data-locale]{display:none}
html[lang="sv"] .group h2 [data-locale="sv"],html[lang="en"] .group h2 [data-locale="en"]{display:inline}
footer{padding:0 24px 40px;color:var(--muted);font-size:11px;max-width:1500px;margin:0 auto}
@media print{
  @page{size:A3 landscape;margin:10mm}
  body{background:#fff;font-size:9pt}
  header{position:static;padding:0 0 8mm;background:#fff}
  .toolbar,nav,footer,.review{display:none!important}
  .layout{display:block;padding:0}
  .group{page-break-inside:auto;margin-bottom:8mm}
  .group h2{page-break-after:avoid}
  .grid{grid-template-columns:repeat(4,1fr);gap:4mm}
  .card{border:1px solid #bbb;padding:3mm}
  .preview-large{width:28mm;min-height:28mm}
  .previews{min-height:32mm}
  .ports{display:block!important}
  .card h3{font-size:10pt}
}
</style>
</head>
<body class="show-ports">
<header>
  <h1>GridScalr <span data-locale="sv">symbolkatalog</span><span data-locale="en">symbol catalogue</span></h1>
  <p class="sub"><span data-locale="sv">Granskningsunderlag för schematiska symboler. Originalstreck, ingen standardcertifiering.</span><span data-locale="en">Design review sheet for schematic symbols. Original stroke artwork, no standards certification.</span></p>
  <div class="toolbar">
    <input id="search" type="search" placeholder="Sök / Search id, name, keyword…" aria-label="Search symbols">
    <button type="button" data-filter="all" class="is-active">All</button>
    <button type="button" data-filter="sign">${setLabel("sign", "en")} · ${setLabel("sign", "sv")}</button>
    <button type="button" data-filter="schematic">${setLabel("schematic", "en")} · ${setLabel("schematic", "sv")}</button>
    <label><input id="ports" type="checkbox" checked> <span data-locale="sv">Visa portar</span><span data-locale="en">Show ports</span></label>
    <button type="button" id="lang">EN / SV</button>
    <button type="button" id="feedback"><span data-locale="sv">Kopiera feedback</span><span data-locale="en">Copy feedback</span></button>
    <button type="button" onclick="window.print()"><span data-locale="sv">Skriv ut A3</span><span data-locale="en">Print A3</span></button>
  </div>
</header>
<div class="layout">
  <nav>${nav}</nav>
  <main>${grouped}</main>
</div>
<footer>${sortedSymbols.length} symbols · ${SIGN_CATEGORIES.length + SCHEMATIC_CATEGORIES.length} categories · generated from src/features/schematics/symbols/registry.ts</footer>
<script>
const state = { filter: "all", query: "" };
const cards = [...document.querySelectorAll(".card")];
const groups = [...document.querySelectorAll(".group")];
const search = document.getElementById("search");
const statusKey = "gridscalr.symbolCatalog.review.v1";
const statuses = JSON.parse(localStorage.getItem(statusKey) || "{}");
for (const select of document.querySelectorAll("[data-review]")) {
  const id = select.dataset.review;
  if (statuses[id]) select.value = statuses[id];
  select.addEventListener("change", () => {
    statuses[id] = select.value;
    localStorage.setItem(statusKey, JSON.stringify(statuses));
  });
}
function apply() {
  const query = state.query.trim().toLocaleLowerCase();
  let visible = 0;
  for (const card of cards) {
    const setMatch = state.filter === "all" || card.dataset.set === state.filter;
    const queryMatch = !query || card.dataset.search.includes(query);
    card.hidden = !(setMatch && queryMatch);
    if (!card.hidden) visible += 1;
  }
  for (const group of groups) {
    group.hidden = !group.querySelector(".card:not([hidden])");
  }
  document.body.dataset.visible = String(visible);
}
search.addEventListener("input", () => { state.query = search.value; apply(); });
for (const button of document.querySelectorAll("[data-filter]")) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    for (const other of document.querySelectorAll("[data-filter]")) other.classList.toggle("is-active", other === button);
    apply();
  });
}
document.getElementById("ports").addEventListener("change", (event) => {
  document.body.classList.toggle("show-ports", event.target.checked);
});
document.getElementById("lang").addEventListener("click", () => {
  document.documentElement.lang = document.documentElement.lang === "sv" ? "en" : "sv";
});
document.getElementById("feedback").addEventListener("click", async () => {
  const lines = cards.map((card) => {
    const id = card.dataset.symbol;
    return id + ": " + (statuses[id] || "unreviewed");
  });
  try {
    await navigator.clipboard.writeText("GridScalr symbol review\\n" + lines.join("\\n"));
    document.getElementById("feedback").textContent = document.documentElement.lang === "sv" ? "Kopierat" : "Copied";
  } catch {
    document.getElementById("feedback").textContent = "Ctrl+C";
  }
});
apply();
</script>
</body>
</html>`;

await mkdir(outputDir, { recursive: true });
await writeFile(output, html, "utf8");
console.log(`Wrote ${output} (${SYMBOLS.length} symbols)`);
