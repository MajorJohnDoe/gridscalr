/**
 * Pure rules for the automated release-artifact checks.
 *
 * The release workflow builds one macOS disk image and one portable `.app.zip`
 * from a universal binary. No Mac hardware is available, so CI proves what it
 * can from the runner itself: the image mounts, `GridScalr.app` and its
 * executable are present, `lipo -info` reports both architectures, and the
 * bundle version matches `package.json` (`scripts/verify-macos-bundle.mjs`).
 * The merged checksum file is verified against the downloaded artifacts in the
 * checksums job (`scripts/verify-release-checksums.mjs`).
 *
 * Keeping the rules here lets `tests/releaseArtifactCheck.test.ts` prove that a
 * thin binary, a missing bundle, a version mismatch and a missing or wrong
 * checksum line are all rejected. The macOS-only shell reads the real tools and
 * passes their output through these functions.
 */

/** The app bundle name inside the image and the archive. */
export const MACOS_APP_NAME = "GridScalr.app";

/** The bundle identifier declared in `src-tauri/tauri.conf.json`. */
export const MACOS_BUNDLE_IDENTIFIER = "com.gridscalr.desktop";

/** The executable name Tauri gives the release binary. */
export const MACOS_BUNDLE_EXECUTABLE = "gridscalr";

/** Path of the executable inside the bundle. */
export const MACOS_EXECUTABLE_PATH = `Contents/MacOS/${MACOS_BUNDLE_EXECUTABLE}`;

/** The universal build must contain both slice architectures. */
export const MACOS_REQUIRED_ARCHITECTURES = Object.freeze(["x86_64", "arm64"]);

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * The two release artifacts the macOS job stages, named exactly as
 * `docs/releasing.md` and the landing site link them.
 */
export function expectedMacArtifacts(version) {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error(`Expected a semantic version such as 0.28.0, received "${version}".`);
  }
  return [`GridScalr_${version}_universal.dmg`, `GridScalr_${version}_universal.app.zip`];
}

/**
 * Reads `lipo -info` output.
 *
 * `lipo` prints either
 * `Non-fat file: <path> is architecture: arm64` or
 * `Architectures in the fat file: <path> are: x86_64 arm64`.
 * An unrecognized line yields no architectures, which the bundle check treats
 * as a failure rather than as an assumed universal binary.
 */
export function parseLipoInfo(text) {
  if (typeof text !== "string") return { architectures: [], fat: false };
  const normalized = text.replace(/\s+/g, " ").trim();
  const fat = /Architectures in the fat file: .*? are: (.+)$/.exec(normalized);
  if (fat) {
    return { architectures: fat[1].split(" ").filter(Boolean), fat: true };
  }
  const thin = /Non-fat file: .*? is architecture: (\S+)$/.exec(normalized);
  if (thin) return { architectures: [thin[1]], fat: false };
  return { architectures: [], fat: false };
}

const CHECKSUM_LINE = /^([0-9a-f]{64}) [ *](.+)$/;

/**
 * Parses a `shasum -a 256` / `sha256sum` listing. Blank lines are ignored;
 * every other line must be `<64 lowercase hex>  <name>` (a `*` binary marker is
 * accepted). Unparseable lines are reported instead of skipped, so a truncated
 * merge cannot pass as a shorter valid file.
 */
export function parseChecksumText(text) {
  const entries = [];
  const invalid = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, index) => {
    const raw = line.trimEnd();
    if (!raw.trim()) return;
    const match = CHECKSUM_LINE.exec(raw);
    if (!match) {
      invalid.push({ line: index + 1, text: raw, reason: "expected '<sha256>  <name>'" });
      return;
    }
    entries.push({ hash: match[1], name: match[2] });
  });
  return { entries, invalid };
}

/**
 * Compares a checksum listing against the files actually present.
 *
 * `files` maps each released file name to the SHA-256 recomputed from its
 * bytes. The check is bidirectional: a listed file must exist with the same
 * hash, a present file must be listed, and every `requiredNames` entry must
 * appear. That is what keeps the DMG and `.app.zip` in the merged
 * `SHA256SUMS.txt` instead of trusting the merge to have copied them.
 */
export function verifyChecksumListing({ text, files = {}, requiredNames = [] } = {}) {
  const issues = [];
  const { entries, invalid } = parseChecksumText(text);
  for (const item of invalid) {
    issues.push({
      code: "checksum-malformed",
      message: `Line ${item.line} of the checksum file is not a SHA-256 line: ${item.text}`,
    });
  }

  const seen = new Map();
  for (const entry of entries) {
    const count = (seen.get(entry.name) ?? 0) + 1;
    seen.set(entry.name, count);
    if (count > 1) {
      issues.push({
        code: "checksum-duplicate",
        message: `${entry.name} is listed more than once in the checksum file.`,
      });
      continue;
    }
    if (!Object.hasOwn(files, entry.name)) {
      issues.push({
        code: "checksum-orphan",
        message: `${entry.name} is listed with a checksum but is not part of the artifact set.`,
      });
      continue;
    }
    if (files[entry.name] !== entry.hash) {
      issues.push({
        code: "checksum-mismatch",
        message: `${entry.name} hashes to ${files[entry.name]}, the checksum file says ${entry.hash}.`,
      });
    }
  }

  for (const name of Object.keys(files)) {
    if (!seen.has(name)) {
      issues.push({
        code: "checksum-unlisted",
        message: `${name} is part of the artifact set but has no line in the checksum file.`,
      });
    }
  }

  for (const name of requiredNames) {
    if (!seen.has(name)) {
      issues.push({
        code: "checksum-missing",
        message: `${name} is missing from the checksum file.`,
      });
    }
  }

  return { ok: issues.length === 0, issues, entries };
}

/**
 * Evaluates one inspected app bundle (inside the mounted image or the extracted
 * archive). Every fact comes from a tool call the CLI already made; this
 * function only decides pass or fail, so the failure modes are testable without
 * macOS.
 */
export function evaluateMacBundle({
  expectedVersion,
  bundleVersion = null,
  bundleIdentifier = null,
  appPresent = false,
  executablePresent = false,
  lipoInfo = null,
} = {}) {
  const issues = [];
  const add = (code, message) => issues.push({ code, message });

  if (!appPresent) {
    add("app-missing", `The artifact does not contain ${MACOS_APP_NAME}.`);
    return { ok: false, issues, architectures: [], fat: false };
  }

  if (!executablePresent) {
    add("executable-missing", `The bundle has no executable at ${MACOS_EXECUTABLE_PATH}.`);
  }
  if (bundleVersion === null || bundleVersion === "") {
    add("version-missing", "Cannot read CFBundleShortVersionString from the bundle's Info.plist.");
  } else if (bundleVersion !== expectedVersion) {
    add(
      "version-mismatch",
      `Info.plist reports ${bundleVersion}, package.json reports ${expectedVersion}.`,
    );
  }
  if (bundleIdentifier !== MACOS_BUNDLE_IDENTIFIER) {
    add(
      "identifier-mismatch",
      `Info.plist reports CFBundleIdentifier ${bundleIdentifier ?? "(missing)"}, expected ${MACOS_BUNDLE_IDENTIFIER}.`,
    );
  }

  const { architectures, fat } = parseLipoInfo(lipoInfo ?? "");
  if (architectures.length === 0) {
    add("lipo-unreadable", "lipo -info did not report an architecture for the bundle executable.");
  } else {
    const missing = MACOS_REQUIRED_ARCHITECTURES.filter((arch) => !architectures.includes(arch));
    if (missing.length > 0) {
      add(
        "thin-binary",
        `The executable contains ${architectures.join(" + ")}; missing ${missing.join(", ")}.`,
      );
    }
  }

  return { ok: issues.length === 0, issues, architectures, fat };
}

/** Formats one sentence for the workflow log; keeps the CLI and tests aligned. */
export function describeIssues(issues) {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
}
