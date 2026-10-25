import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const ROOT_FILES = [
  "index.html",
  "src/app/App.ts",
  "src/main.ts",
  "src/styles.css",
  "docs/user-guide.md",
  "docs/workflows.md",
  "docs/shortcuts.md",
];
const ROOT_DIRS = ["src/ui", "src/canvas", "src/help", "src/styles"];

async function collectFiles(root, relativePath) {
  const absolute = resolve(root, relativePath);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await collectFiles(root, child)));
    else if (/\.(ts|css|md|html)$/.test(entry.name)) files.push(child);
  }
  return files;
}

/**
 * A deterministic fingerprint of the files that affect screenshots. The
 * manifest stores it so check:docs can warn when a UI change was not followed
 * by a fresh docs:capture.
 */
export async function docsSourceFingerprint(root) {
  const files = [...ROOT_FILES];
  for (const dir of ROOT_DIRS) files.push(...(await collectFiles(root, dir)));
  files.sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${relative(root, resolve(root, file))}\0`);
    hash.update(await readFile(resolve(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
