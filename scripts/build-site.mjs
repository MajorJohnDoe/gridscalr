import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = resolve(root, "site");
const outputDir = resolve(root, "site-dist");
const screenshotsDir = resolve(root, "docs/screenshots");
const socialPreview = resolve(root, "docs/social-preview.png");

const baseUrl = "https://majorjohndoe.github.io/gridscalr";

const screenshots = [
  "hero.png",
  "count-schedule.png",
  "quantities.png",
  "split-view.png",
  "symbols.png",
];

async function requireFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`Missing site asset: ${path}`);
  }
}

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

await requireFile(socialPreview);
await cp(socialPreview, resolve(outputDir, "social-preview.png"));

await writeFile(resolve(outputDir, "sitemap.xml"), sitemap, "utf8");
await writeFile(resolve(outputDir, "robots.txt"), robots, "utf8");

// Fail loudly if the source pages are missing instead of deploying a partial site.
for (const page of ["index.html", "sv/index.html", "404.html"]) {
  await requireFile(resolve(outputDir, page));
}

const manifest = await readFile(resolve(screenshotsDir, "manifest.json"), "utf8");
const manifestVersion = JSON.parse(manifest).appVersion;
console.log(`Built site-dist from current main (screenshots from app ${manifestVersion}).`);
console.log(`  ${screenshots.length} screenshots, social preview, sitemap.xml and robots.txt`);
