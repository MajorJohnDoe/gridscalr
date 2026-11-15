/**
 * Verifies the merged `SHA256SUMS.txt` against the artifacts CI just built.
 *
 * The `checksums` job downloads every platform artifact, merges the per-platform
 * listings and runs this script. It recomputes each file's SHA-256 and requires
 * the listing and the artifact set to match in both directions: no artifact
 * without a line, no line without an artifact, and no wrong hash. The two macOS
 * release names are required explicitly, so a renamed or dropped DMG fails here
 * as well as in the macOS job.
 *
 * This is the job that proves the published checksum file covers the DMG and
 * `.app.zip`; see `docs/releasing.md` section 5.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeIssues,
  expectedMacArtifacts,
  verifyChecksumListing,
} from "./release-artifact-rules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Collects every downloaded artifact by file name; per-platform folders flatten. */
function collectArtifacts(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectArtifacts(path, files);
      continue;
    }
    if (/^SHA256SUMS.*\.txt$/.test(entry.name)) continue;
    if (files.has(entry.name)) {
      throw new Error(`Two downloaded artifacts share the name ${entry.name}.`);
    }
    files.set(entry.name, sha256(path));
  }
  return files;
}

const sumsPath = resolve(root, argument("--sums", "SHA256SUMS.txt"));
const artifactsDir = resolve(root, argument("--artifacts", "artifacts"));
const packagePath = resolve(root, argument("--package", "package.json"));

if (!existsSync(sumsPath)) {
  console.error(`::error::Missing merged checksum file ${sumsPath}.`);
  process.exit(1);
}
if (!existsSync(artifactsDir)) {
  console.error(`::error::Missing downloaded artifacts folder ${artifactsDir}.`);
  process.exit(1);
}

const version = JSON.parse(readFileSync(packagePath, "utf8")).version;
const files = collectArtifacts(artifactsDir, new Map());
if (files.size === 0) {
  console.error(`::error::No release artifacts found under ${artifactsDir}.`);
  process.exit(1);
}

for (const [name, hash] of files) console.log(`${hash}  ${name}`);

const listing = verifyChecksumListing({
  text: readFileSync(sumsPath, "utf8"),
  files: Object.fromEntries(files),
  requiredNames: expectedMacArtifacts(version),
});

if (!listing.ok) {
  console.error(`Merged checksum file ${sumsPath} does not match the artifacts:`);
  console.error(describeIssues(listing.issues));
  console.log(
    "::error::The merged SHA256SUMS.txt does not cover the downloaded release artifacts.",
  );
  process.exit(1);
}

console.log(
  `Merged SHA256SUMS.txt verified: ${listing.entries.length} artifacts, ` +
    `including GridScalr_${version}_universal.dmg and GridScalr_${version}_universal.app.zip.`,
);
