import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MACOS_APP_NAME,
  MACOS_BUNDLE_IDENTIFIER,
  MACOS_EXECUTABLE_PATH,
  evaluateMacBundle,
  expectedMacArtifacts,
  parseChecksumText,
  parseLipoInfo,
  verifyChecksumListing,
} from "../scripts/release-artifact-rules.mjs";

const root = resolve(__dirname, "..");

const UNIVERSAL =
  "Architectures in the fat file: /tmp/GridScalr.app/Contents/MacOS/gridscalr are: x86_64 arm64";
const THIN = "Non-fat file: /tmp/GridScalr.app/Contents/MacOS/gridscalr is architecture: arm64";
const HASH = "a".repeat(64);

function passingBundle() {
  return {
    expectedVersion: "0.28.0",
    bundleVersion: "0.28.0",
    bundleIdentifier: MACOS_BUNDLE_IDENTIFIER,
    appPresent: true,
    executablePresent: true,
    lipoInfo: UNIVERSAL,
  };
}

function codes(issues: { code: string }[]) {
  return issues.map((issue) => issue.code);
}

describe("macOS release artifact rules", () => {
  it("derives the staged artifact names from the app version", () => {
    expect(expectedMacArtifacts("0.28.0")).toEqual([
      "GridScalr_0.28.0_universal.dmg",
      "GridScalr_0.28.0_universal.app.zip",
    ]);
    expect(() => expectedMacArtifacts("0.28")).toThrow(/semantic version/);
    expect(() => expectedMacArtifacts("")).toThrow(/semantic version/);
  });

  it("reads a universal binary from lipo -info", () => {
    expect(parseLipoInfo(UNIVERSAL)).toEqual({ architectures: ["x86_64", "arm64"], fat: true });
    expect(parseLipoInfo(THIN)).toEqual({ architectures: ["arm64"], fat: false });
    expect(parseLipoInfo(null)).toEqual({ architectures: [], fat: false });
    expect(parseLipoInfo("lipo: can't open input file")).toEqual({
      architectures: [],
      fat: false,
    });
  });

  it("accepts a universal bundle that matches package.json", () => {
    const result = evaluateMacBundle(passingBundle());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.architectures).toEqual(["x86_64", "arm64"]);
  });

  it("fails a thin binary even when everything else matches", () => {
    const result = evaluateMacBundle({ ...passingBundle(), lipoInfo: THIN });
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toEqual(["thin-binary"]);
    expect(result.issues[0].message).toContain("missing x86_64");
  });

  it("fails an unreadable lipo result instead of assuming universal", () => {
    const result = evaluateMacBundle({ ...passingBundle(), lipoInfo: "lipo: unknown error" });
    expect(codes(result.issues)).toEqual(["lipo-unreadable"]);
  });

  it("fails a bundle that is missing, has no executable or names the wrong app", () => {
    expect(codes(evaluateMacBundle({ expectedVersion: "0.28.0" }).issues)).toEqual(["app-missing"]);

    const noExecutable = evaluateMacBundle({ ...passingBundle(), executablePresent: false });
    expect(codes(noExecutable.issues)).toEqual(["executable-missing"]);
    expect(MACOS_EXECUTABLE_PATH).toBe("Contents/MacOS/gridscalr");
    expect(MACOS_APP_NAME).toBe("GridScalr.app");

    const wrongApp = evaluateMacBundle({
      ...passingBundle(),
      bundleIdentifier: "com.example.other",
    });
    expect(codes(wrongApp.issues)).toEqual(["identifier-mismatch"]);
  });

  it("fails a version that does not match package.json", () => {
    const stale = evaluateMacBundle({ ...passingBundle(), bundleVersion: "0.27.0" });
    expect(codes(stale.issues)).toEqual(["version-mismatch"]);
    expect(stale.issues[0].message).toContain("0.27.0");

    const missing = evaluateMacBundle({ ...passingBundle(), bundleVersion: null });
    expect(codes(missing.issues)).toEqual(["version-missing"]);
  });
});

describe("checksum listing rules", () => {
  it("parses shasum text and binary-mode markers, ignoring blank lines", () => {
    const parsed = parseChecksumText(
      `${HASH}  GridScalr_0.28.0_universal.dmg\n\n${HASH} *gridscalr.exe\n`,
    );
    expect(parsed.invalid).toEqual([]);
    expect(parsed.entries.map((entry) => entry.name)).toEqual([
      "GridScalr_0.28.0_universal.dmg",
      "gridscalr.exe",
    ]);
  });

  it("reports a truncated or malformed line instead of skipping it", () => {
    const parsed = parseChecksumText("not a checksum line\n");
    expect(parsed.entries).toEqual([]);
    expect(parsed.invalid).toHaveLength(1);
    expect(parsed.invalid[0].line).toBe(1);
  });

  it("passes when every artifact is listed once with its real hash", () => {
    const files = {
      "GridScalr_0.28.0_universal.dmg": HASH,
      "GridScalr_0.28.0_universal.app.zip": "b".repeat(64),
    };
    const listing = verifyChecksumListing({
      text: `${files["GridScalr_0.28.0_universal.dmg"]}  GridScalr_0.28.0_universal.dmg\n${files["GridScalr_0.28.0_universal.app.zip"]}  GridScalr_0.28.0_universal.app.zip\n`,
      files,
      requiredNames: expectedMacArtifacts("0.28.0"),
    });
    expect(listing.issues).toEqual([]);
    expect(listing.ok).toBe(true);
  });

  it("fails when the DMG is missing from the merged file", () => {
    const listing = verifyChecksumListing({
      text: `${HASH}  GridScalr_0.28.0_universal.app.zip\n`,
      files: { "GridScalr_0.28.0_universal.app.zip": HASH },
      requiredNames: expectedMacArtifacts("0.28.0"),
    });
    expect(codes(listing.issues)).toContain("checksum-missing");
    expect(listing.issues.some((issue) => issue.message.includes("universal.dmg"))).toBe(true);
  });

  it("fails a wrong hash, a listed file that is absent and a file without a line", () => {
    const mismatch = verifyChecksumListing({
      text: `${HASH}  GridScalr_0.28.0_universal.dmg\n`,
      files: { "GridScalr_0.28.0_universal.dmg": "c".repeat(64) },
    });
    expect(codes(mismatch.issues)).toEqual(["checksum-mismatch"]);

    const orphan = verifyChecksumListing({
      text: `${HASH}  gridscalr.exe\n`,
      files: {},
    });
    expect(codes(orphan.issues)).toEqual(["checksum-orphan"]);

    const unlisted = verifyChecksumListing({
      text: "",
      files: { "gridscalr.exe": HASH },
    });
    expect(codes(unlisted.issues)).toEqual(["checksum-unlisted"]);
  });

  it("fails a duplicated line and a malformed line", () => {
    const duplicate = verifyChecksumListing({
      text: `${HASH}  gridscalr.exe\n${HASH}  gridscalr.exe\n`,
      files: { "gridscalr.exe": HASH },
    });
    expect(codes(duplicate.issues)).toEqual(["checksum-duplicate"]);

    const malformed = verifyChecksumListing({ text: `${HASH} gridscalr.exe\n`, files: {} });
    expect(codes(malformed.issues)).toEqual(["checksum-malformed"]);
  });
});

describe("release workflow wiring", () => {
  const workflow = readFileSync(resolve(root, ".github", "workflows", "release.yml"), "utf8");

  it("runs the macOS bundle verification in the macOS job only", () => {
    expect(workflow).toContain("node scripts/verify-macos-bundle.mjs");
    const step =
      /- name: Verify the macOS[\s\S]*?run: node scripts\/verify-macos-bundle\.mjs[^\n]*/.exec(
        workflow,
      );
    expect(step, "the macOS verification step is missing from release.yml").not.toBeNull();
    expect(step?.[0]).toContain("if: matrix.platform == 'macOS'");
  });

  it("verifies the merged checksum file against the downloaded artifacts", () => {
    expect(workflow).toContain("node scripts/verify-release-checksums.mjs");
    expect(workflow).toContain("name: gridscalr-checksums");
    expect(workflow).toContain("SHA256SUMS.txt");
  });

  it("never launches a release binary with the debug-only smoke flag again", () => {
    // Comments explain why the flag is absent; only executable lines count.
    const executable = workflow
      .split("\n")
      .map((line) => line.replace(/\s+#.*$/, ""))
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(executable).not.toContain("--smoke-test");
  });

  it("documents the automated check and the unverified hardware install", () => {
    const releasing = readFileSync(resolve(root, "docs", "releasing.md"), "utf8");
    const limitations = readFileSync(resolve(root, "docs", "limitations.md"), "utf8");
    expect(releasing).toContain("scripts/verify-macos-bundle.mjs");
    expect(releasing).toContain("scripts/verify-release-checksums.mjs");
    expect(releasing).toContain("hdiutil");
    expect(releasing).toContain("license agreement");
    expect(limitations).toContain("No physical Apple-hardware install has been verified");
    expect(limitations).toContain("Gatekeeper");
  });
});
