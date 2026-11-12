import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Foundation modules created by the robustness plan. They start with the
 * stricter ADR 0013 boundary; older features can be migrated later.
 */
const FOUNDATION_FEATURES = [
  "src/features/saveIntegrity",
  "src/features/sessionRecovery",
  "src/features/pageModel",
  "src/features/sourceStorage",
  "src/features/projectIntegrity",
  "src/features/statusOverview",
  "src/features/conflictedCopies",
  "src/features/pageReorder",
  "src/features/pageFileDrop",
  "src/features/pageStatus",
  "src/features/pageMenu",
  "src/features/listInteraction",
  "src/features/importProvenance",
  "src/features/layerTree",
];

const errors = [];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...(await collect(absolute)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(relative(root, absolute).split("\\").join("/"));
    }
  }
  return files;
}

function importedSpecifiers(text) {
  const specifiers = [];
  const pattern = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

function isIndex(path, feature) {
  return path === feature || path === `${feature}/index` || path === `${feature}/index.ts`;
}

function featureFor(path) {
  return FOUNDATION_FEATURES.find((feature) => path === feature || path.startsWith(`${feature}/`));
}

const existingFeatures = [];
for (const feature of FOUNDATION_FEATURES) {
  if (!(await exists(resolve(root, feature)))) continue;
  existingFeatures.push(feature);
  if (!(await exists(resolve(root, feature, "index.ts")))) {
    errors.push(`${feature}: foundation feature is missing its public index.ts`);
  }
}

const files = await collect(resolve(root, "src"));
for (const file of files) {
  const text = await readFile(resolve(root, file), "utf8");
  for (const specifier of importedSpecifiers(text)) {
    if (!specifier.startsWith(".")) continue;
    const resolved = relative(root, resolve(root, dirname(file), specifier))
      .split("\\")
      .join("/")
      .replace(/\.ts$/, "");
    const feature = featureFor(resolved);
    if (!feature) continue;
    if (file.startsWith(`${feature}/`)) continue;
    if (isIndex(resolved, feature)) {
      if (file.startsWith("src/model/") || file.startsWith("src/io/")) {
        errors.push(
          `${file}: lower layer must not import ${feature}; keep shared rules in src/model`,
        );
      }
      continue;
    }
    errors.push(
      `${file}: import ${specifier} reaches into ${feature}; import the public ${feature} surface instead`,
    );
  }
}

if (errors.length) {
  console.error("Module boundary check failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error("See docs/adr/0013-module-first-foundation.md.");
  process.exit(1);
}

console.log(
  `Module boundary check passed: ${existingFeatures.length} foundation feature(s) checked, ${files.length} source files scanned.`,
);
