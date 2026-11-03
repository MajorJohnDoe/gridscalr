import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = resolve(root, "site");
const outputDir = resolve(root, "site-dist");
const screenshotsDir = resolve(root, "docs/screenshots");
const socialPreview = resolve(root, "docs/social-preview.png");
const iconsDir = resolve(root, "src-tauri/icons");

const baseUrl = "https://majorjohndoe.github.io/gridscalr";

const screenshots = [
  "hero.png",
  "measure.png",
  "calibration.png",
  "markups.png",
  "layers.png",
  "quantities.png",
  "count-types.png",
  "count-schedule.png",
  "markups-list.png",
  "symbols.png",
  "images.png",
  "export.png",
  "split-view.png",
  "compare.png",
  "search.png",
  "workflows-help.png",
];

const iconFiles = [
  ["app-icon.svg", "assets/app-icon.svg"],
  ["icon.ico", "assets/favicon.ico"],
  ["128x128.png", "assets/app-icon-128.png"],
];

async function requireFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`Missing site asset: ${path}`);
  }
}

/**
 * Optional per-platform downloads. Each field is rendered only when
 * site/release.json provides it, so the site never links to an asset that the
 * published release does not contain.
 */
const platformAssets = [
  {
    field: "macosDmgUrl",
    attribute: "data-macos-dmg",
    en: ["macOS disk image (DMG)", "Universal build for Intel and Apple Silicon."],
    sv: ["macOS-skivavbild (DMG)", "Universellt bygge för Intel och Apple Silicon."],
  },
  {
    field: "macosZipUrl",
    attribute: "data-macos-zip",
    en: ["macOS app bundle (.zip)", "Portable app bundle without an installer."],
    sv: ["macOS-apppaket (.zip)", "Portabelt app-paket utan installerare."],
  },
  {
    field: "linuxAppImageUrl",
    attribute: "data-linux-appimage",
    en: ["Linux AppImage", "Portable x86_64 build for any distribution."],
    sv: ["Linux AppImage", "Portabelt x86_64-bygge för alla distributioner."],
  },
  {
    field: "linuxDebUrl",
    attribute: "data-linux-deb",
    en: ["Linux .deb package", "Debian, Ubuntu and derivatives."],
    sv: ["Linux .deb-paket", "Debian, Ubuntu och derivat."],
  },
  {
    field: "linuxTarballUrl",
    attribute: "data-linux-tarball",
    en: ["Linux tarball", "Binary archive for x86_64 systems."],
    sv: ["Linux-tarball", "Binärarkiv för x86_64-system."],
  },
];

async function readRelease() {
  const path = resolve(siteDir, "release.json");
  await requireFile(path);
  let release;
  try {
    release = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`site/release.json does not parse: ${error.message}`);
  }
  for (const field of [
    "version",
    "releasedAt",
    "tag",
    "releaseUrl",
    "latestUrl",
    "notesUrl",
    "installerUrl",
    "msiUrl",
    "portableUrl",
    "checksumsUrl",
  ]) {
    if (typeof release[field] !== "string" || !release[field].trim()) {
      throw new Error(`site/release.json is missing ${field}`);
    }
  }
  if (!/^\d+\.\d+\.\d+$/.test(release.version)) {
    throw new Error(`site/release.json has an invalid version: ${release.version}`);
  }
  if (release.tag !== `v${release.version}`) {
    throw new Error("site/release.json tag must match the version");
  }
  for (const asset of platformAssets) {
    const url = release[asset.field];
    if (url === undefined) continue;
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error(`site/release.json ${asset.field} must be an HTTPS URL`);
    }
    if (!url.includes(`/download/${release.tag}/`)) {
      throw new Error(`site/release.json ${asset.field} must point to the tagged release asset`);
    }
  }
  return release;
}

async function walkHtml(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkHtml(path)));
    else if (extname(entry.name) === ".html") files.push(path);
  }
  return files;
}

const release = await readRelease();

function platformDownloads(lang) {
  const assets = platformAssets.filter((asset) => typeof release[asset.field] === "string");
  if (!assets.length) return "";
  const heading = lang === "sv" ? "macOS och Linux" : "macOS and Linux";
  const rows = assets.map((asset) => {
    const [label, note] = asset[lang];
    return `<li>
                  <a ${asset.attribute} href="${release[asset.field]}">${label}</a>
                  <span>${note}</span>
                </li>`;
  });
  return [
    `<li class="download-platform-heading"><span>${heading}</span></li>`,
    ...rows,
  ].join("\n                ");
}

const tokens = {
  "{{RELEASE_VERSION}}": release.version,
  "{{RELEASE_DATE}}": release.releasedAt,
  "{{RELEASE_URL}}": release.releaseUrl,
  "{{RELEASE_NOTES_URL}}": release.notesUrl,
  "{{INSTALLER_URL}}": release.installerUrl,
  "{{MSI_URL}}": release.msiUrl,
  "{{PORTABLE_URL}}": release.portableUrl,
  "{{CHECKSUMS_URL}}": release.checksumsUrl,
  "{{PLATFORM_DOWNLOADS}}": platformDownloads("en"),
  "{{PLATFORM_DOWNLOADS_SV}}": platformDownloads("sv"),
};

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${baseUrl}/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/" />
    <xhtml:link rel="alternate" hreflang="sv" href="${baseUrl}/sv/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}/" />
  </url>
  <url>
    <loc>${baseUrl}/sv/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/" />
    <xhtml:link rel="alternate" hreflang="sv" href="${baseUrl}/sv/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}/" />
  </url>
  <url>
    <loc>${baseUrl}/features/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/features/" />
    <xhtml:link rel="alternate" hreflang="sv" href="${baseUrl}/sv/funktioner/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}/features/" />
  </url>
  <url>
    <loc>${baseUrl}/sv/funktioner/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${baseUrl}/features/" />
    <xhtml:link rel="alternate" hreflang="sv" href="${baseUrl}/sv/funktioner/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}/features/" />
  </url>
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await cp(siteDir, outputDir, { recursive: true });

await mkdir(resolve(outputDir, "screenshots"), { recursive: true });
for (const file of screenshots) {
  await requireFile(resolve(screenshotsDir, file));
  await cp(resolve(screenshotsDir, file), resolve(outputDir, "screenshots", file));
}

for (const [source, target] of iconFiles) {
  await requireFile(resolve(iconsDir, source));
  await cp(resolve(iconsDir, source), resolve(outputDir, target));
}

await requireFile(socialPreview);
await cp(socialPreview, resolve(outputDir, "social-preview.png"));

for (const file of await walkHtml(outputDir)) {
  let html = await readFile(file, "utf8");
  for (const [token, value] of Object.entries(tokens)) {
    html = html.split(token).join(value);
  }
  await writeFile(file, html, "utf8");
}

await writeFile(resolve(outputDir, "sitemap.xml"), sitemap, "utf8");
await writeFile(resolve(outputDir, "robots.txt"), robots, "utf8");

// Fail loudly if the source pages are missing instead of deploying a partial site.
for (const page of [
  "index.html",
  "sv/index.html",
  "features/index.html",
  "sv/funktioner/index.html",
  "404.html",
]) {
  await requireFile(resolve(outputDir, page));
}

console.log(`Built site-dist for GridScalr ${release.version} (released ${release.releasedAt}).`);
console.log(
  `  ${screenshots.length} screenshots, app icons, social preview, sitemap.xml and robots.txt`,
);
