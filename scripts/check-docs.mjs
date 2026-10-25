import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
let checkedLinks = 0;
let checkedImages = 0;

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (extname(entry.name) === ".md") files.push(path);
  }
  return files;
}

function slugify(value, used) {
  const base =
    value
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "section";
  let slug = base;
  let index = 2;
  while (used.has(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  used.add(slug);
  return slug;
}

function headingSlugs(markdown) {
  const used = new Set();
  const slugs = new Set();
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    slugs.add(slugify(heading[1].trim(), used));
  }
  return slugs;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const markdownFiles = [resolve(root, "README.md"), ...(await walk(resolve(root, "docs")))];
const slugCache = new Map();
const referencedScreenshots = new Set();

for (const file of markdownFiles) {
  const markdown = await readFile(file, "utf8");
  const display = relative(root, file).split(sep).join("/");
  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  for (const match of markdown.matchAll(imagePattern)) {
    const alt = match[1].trim();
    if (!alt) errors.push(`${display}: image has no alt text (${match[2]})`);
    if (match[2].includes("/screenshots/") || match[2].startsWith("screenshots/")) {
      referencedScreenshots.add(match[2].split(/[\\/]/).pop());
    }
  }

  const linkPattern = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const image = match[1] === "!";
    const target = match[3];
    if (/^(https?:|mailto:|#)/i.test(target)) {
      if (target.startsWith("#")) {
        const slug = target.slice(1);
        const slugs = slugCache.get(file) ?? headingSlugs(markdown);
        slugCache.set(file, slugs);
        if (!slugs.has(slug)) errors.push(`${display}: missing anchor #${slug}`);
      }
      continue;
    }
    if (target.startsWith("#")) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;

    const [rawPath, anchor] = target.split("#");
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      decoded = rawPath;
    }
    const absolute = resolve(dirname(file), decoded);
    if (!absolute.startsWith(root)) {
      errors.push(`${display}: link points outside the repository (${target})`);
      continue;
    }
    if (!(await exists(absolute))) {
      errors.push(`${display}: missing ${image ? "image" : "file"} ${target}`);
      continue;
    }
    if (image) checkedImages += 1;
    else checkedLinks += 1;

    if (anchor && extname(absolute) === ".md") {
      let slugs = slugCache.get(absolute);
      if (!slugs) {
        slugs = headingSlugs(await readFile(absolute, "utf8"));
        slugCache.set(absolute, slugs);
      }
      if (!slugs.has(anchor)) {
        errors.push(`${display}: missing anchor #${anchor} in ${relative(root, absolute)}`);
      }
    }
  }
}

const guide = await readFile(resolve(root, "docs", "user-guide.md"), "utf8");
const readme = await readFile(resolve(root, "README.md"), "utf8");

const toolDefs = await readFile(resolve(root, "src", "ui", "toolDefs.ts"), "utf8");
for (const match of toolDefs.matchAll(/label:\s*"([^"]+)"/g)) {
  const label = match[1];
  if (!guide.toLowerCase().includes(label.toLowerCase())) {
    errors.push(`docs/user-guide.md: tool "${label}" is not described`);
  }
}

const menuDescription = /Menu bar[^\n]*File[^\n]*Edit[^\n]*View[^\n]*Settings[^\n]*Help/i;
if (!menuDescription.test(readme) && !menuDescription.test(guide)) {
  errors.push("Documentation does not describe the File, Edit, View, Settings and Help menus");
}
for (const topic of ["Workflows", "User guide", "Keyboard shortcuts", "About"]) {
  if (!readme.includes(topic)) errors.push(`README does not describe the Help topic "${topic}"`);
}

const types = await readFile(resolve(root, "src", "model", "types.ts"), "utf8");
const schemaMatch = /SCHEMA_VERSION\s*=\s*(\d+)/.exec(types);
if (!schemaMatch) errors.push("Could not read SCHEMA_VERSION from src/model/types.ts");
else {
  const schema = schemaMatch[1];
  for (const [name, text] of [
    ["README.md", readme],
    ["docs/user-guide.md", guide],
  ]) {
    if (!new RegExp(`schema\\s+(?:version\\s+)?v?${schema}\\b`, "i").test(text)) {
      errors.push(`${name}: does not mention the current schema version ${schema}`);
    }
  }
}

const manifestPath = resolve(root, "docs", "screenshots", "manifest.json");
if (!(await exists(manifestPath))) {
  errors.push("docs/screenshots/manifest.json is missing; run npm run docs:capture");
} else {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  if (manifest.appVersion !== packageJson.version) {
    errors.push(
      `docs/screenshots/manifest.json: appVersion ${manifest.appVersion} does not match package.json ${packageJson.version}`,
    );
  }
  const manifestFiles = new Set();
  for (const screenshot of manifest.screenshots ?? []) {
    if (!screenshot.file) {
      errors.push("docs/screenshots/manifest.json: screenshot without file");
      continue;
    }
    manifestFiles.add(screenshot.file);
    if (!(await exists(resolve(root, "docs", "screenshots", screenshot.file)))) {
      errors.push(`docs/screenshots/manifest.json: missing ${screenshot.file}`);
    }
    if (!referencedScreenshots.has(screenshot.file)) {
      errors.push(`Screenshot ${screenshot.file} is not referenced by any documentation`);
    }
    if (!screenshot.alt?.trim()) {
      errors.push(`docs/screenshots/manifest.json: ${screenshot.file} has no alt text`);
    }
  }
  for (const file of await readdir(resolve(root, "docs", "screenshots"))) {
    if (!/\.(png|webp)$/i.test(file)) continue;
    if (!manifestFiles.has(file)) {
      errors.push(`docs/screenshots/${file} is not listed in manifest.json`);
    }
  }
}

if (errors.length) {
  console.error(`Documentation check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed: ${checkedLinks} links, ${checkedImages} images, ${referencedScreenshots.size} screenshots.`,
  );
}
