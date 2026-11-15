/**
 * macOS-only verification of the staged release artifacts.
 *
 * Run by the `Build macOS` job in `.github/workflows/release.yml` after the
 * staging step, on the real macOS runner. It mounts the DMG, inspects
 * `GridScalr.app` inside the mounted image and inside the portable `.app.zip`,
 * and fails on a missing bundle, a thin binary, a wrong bundle identity or a
 * version that does not match `package.json`. It also verifies
 * `SHA256SUMS-macos.txt` against the two staged files, so the hashes are checked
 * before the merged checksum file is produced by the `checksums` job.
 *
 * The release binary cannot run the debug-only smoke harness (F-037/F-074), so
 * this step proves the artifact structure and identity instead of launching it.
 * See `docs/releasing.md` section 4a and the limitation in
 * `docs/limitations.md`. All decisions live in `release-artifact-rules.mjs`;
 * this file only calls the macOS tools and reports.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MACOS_APP_NAME,
  MACOS_EXECUTABLE_PATH,
  describeIssues,
  evaluateMacBundle,
  expectedMacArtifacts,
  verifyChecksumListing,
} from "./release-artifact-rules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} needs a value.`);
  }
  return value;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function plistValue(plist, key) {
  try {
    return run("plutil", ["-extract", key, "raw", "-o", "-", plist]).trim();
  } catch {
    return null;
  }
}

function lipoInfo(executable) {
  try {
    return run("lipo", ["-info", executable]).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `lipo -info failed: ${detail}`;
  }
}

function inspectBundle(directory, expectedVersion) {
  const app = join(directory, MACOS_APP_NAME);
  const plist = join(app, "Contents", "Info.plist");
  const executable = join(app, MACOS_EXECUTABLE_PATH);
  const appPresent = existsSync(app);
  const executablePresent = existsSync(executable);
  const result = evaluateMacBundle({
    expectedVersion,
    appPresent,
    executablePresent,
    bundleVersion: appPresent ? plistValue(plist, "CFBundleShortVersionString") : null,
    bundleIdentifier: appPresent ? plistValue(plist, "CFBundleIdentifier") : null,
    lipoInfo: executablePresent ? lipoInfo(executable) : null,
  });
  return { app, result };
}

function report(label, result) {
  if (result.architectures.length > 0) {
    console.log(
      `${label}: ${MACOS_APP_NAME} contains ${result.architectures.join(" + ")}` +
        `${result.fat ? " (fat binary)" : " (thin binary)"}.`,
    );
  }
  if (result.ok) {
    console.log(`${label}: bundle structure, identity, architectures and version match.`);
  } else {
    console.error(`${label} failed:\n${describeIssues(result.issues)}`);
  }
  return result.ok;
}

const release = resolve(root, argument("--release", "release"));
const packagePath = resolve(root, argument("--package", "package.json"));

if (process.platform !== "darwin") {
  // `hdiutil`, `lipo` and `plutil` do not exist elsewhere. The workflow only
  // calls this step on macOS; a local run must fail loudly, not pass vacuously.
  console.log("::error::verify-macos-bundle.mjs needs macOS tools (hdiutil, lipo, plutil).");
  process.exit(1);
}

const version = JSON.parse(readFileSync(packagePath, "utf8")).version;
const [dmgName, zipName] = expectedMacArtifacts(version);
const dmgPath = join(release, dmgName);
const zipPath = join(release, zipName);

let failed = false;
const fail = (message) => {
  failed = true;
  console.log(`::error::${message}`);
};

for (const [name, path] of [
  [dmgName, dmgPath],
  [zipName, zipPath],
]) {
  if (existsSync(path)) {
    console.log(`Staged ${name}: ${sha256(path)}`);
  } else {
    fail(`Expected ${name} in ${release}, but it is not there.`);
  }
}

const sumsPath = join(release, "SHA256SUMS-macos.txt");
if (existsSync(sumsPath) && existsSync(dmgPath) && existsSync(zipPath)) {
  const listing = verifyChecksumListing({
    text: readFileSync(sumsPath, "utf8"),
    files: { [dmgName]: sha256(dmgPath), [zipName]: sha256(zipPath) },
    requiredNames: [dmgName, zipName],
  });
  if (listing.ok) {
    console.log(`SHA256SUMS-macos.txt lists both artifacts with matching hashes.`);
  } else {
    failed = true;
    console.error(`SHA256SUMS-macos.txt failed:\n${describeIssues(listing.issues)}`);
  }
} else {
  fail(`Missing ${sumsPath} or one of the staged artifacts.`);
}

if (existsSync(dmgPath)) {
  const mount = mkdtempSync(join(tmpdir(), "gridscalr-dmg-"));
  let attached = false;
  try {
    // Tauri embeds `bundle.licenseFile` (LICENSE) as the disk-image license
    // agreement, so `hdiutil attach` prints the MIT license and asks
    // "Agree Y/N?". `hdiutil` has no non-interactive accept flag, so the answer
    // is written to stdin the way `yes | hdiutil attach` does it; without it a
    // non-interactive stdin reaches EOF and the attach is cancelled.
    run(
      "hdiutil",
      ["attach", "-nobrowse", "-readonly", "-noverify", "-mountpoint", mount, dmgPath],
      { input: "y\n".repeat(20) },
    );
    attached = true;
    console.log(`Attached ${dmgName} at ${mount}.`);
    const { result } = inspectBundle(mount, version);
    failed = !report("DMG", result) || failed;
  } catch (error) {
    fail(`hdiutil could not attach ${dmgName}: ${error instanceof Error ? error.message : error}`);
  } finally {
    if (attached) {
      try {
        run("hdiutil", ["detach", mount, "-force"]);
        console.log(`Detached ${mount}.`);
      } catch (error) {
        // A failed detach leaves an image on this ephemeral runner; it is not a
        // reason to fail a release whose artifacts are correct.
        console.log(
          `::warning::Could not detach ${mount}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    rmSync(mount, { recursive: true, force: true });
  }
}

const extracted = mkdtempSync(join(tmpdir(), "gridscalr-appzip-"));
try {
  if (existsSync(zipPath)) {
    try {
      run("ditto", ["-x", "-k", zipPath, extracted]);
      console.log(`Extracted ${zipName}.`);
      const { result } = inspectBundle(extracted, version);
      failed = !report("APPZIP", result) || failed;
    } catch (error) {
      fail(`ditto could not extract ${zipName}: ${error instanceof Error ? error.message : error}`);
    }
  }
} finally {
  rmSync(extracted, { recursive: true, force: true });
}

if (failed) {
  console.error("macOS artifact verification failed. Do not publish these artifacts.");
  process.exit(1);
}
console.log(`macOS artifact ${version} verified: universal bundle, matching identity and hashes.`);
