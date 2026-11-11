/**
 * Adversarial path, archive and project corpus (issue #171).
 *
 * The rules under test are the file-safety invariants, not "parsing succeeds":
 *
 * 1. no write may escape the roots the app owns, and the app's own
 *    managed-copy destination must stay writable;
 * 2. a source PDF/TIF is never modified: every spelling of it is protected;
 * 3. a managed copy is only written inside `<project>.drawings/`;
 * 4. a rejected input produces a structured error, never an internal TypeError.
 *
 * The generators are seeded, so a failure reproduces from the constants below.
 * The Rust boundary is covered by `path_guard_tests.rs`, `source_copy` and
 * `package.rs`; this file also asserts that those guards are still wired, so
 * deleting one is visible in the normal suite.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { withTestPageIds } from "../helpers/pages";
import {
  adversarialName,
  caseVariants,
  corpusLabel,
  integer,
  pathSpellings,
  pick,
  prng,
  PROTECTED_SOURCE_PATHS,
  siblingPath,
  truncationOffsets,
} from "../helpers/fuzz";
import { t } from "../../src/i18n";
import {
  managedCopyProtectedPaths,
  managedDrawingsFolder,
  parseProject,
  serializeProject,
  sourceDocumentPaths,
} from "../../src/io/projectFile";
import { MAX_PACKAGE_TOTAL_BYTES, MAX_PROJECT_BYTES, MAX_SOURCE_BYTES } from "../../src/io/limits";
import { describeCommandError } from "../../src/io/platformError";
import {
  assertWritablePath,
  findProtectedPath,
  isPathInside,
  pathComparisonKey,
} from "../../src/io/writeGuard";
import { validateProject } from "../../src/model/integrity";
import { createProject, defaultDocument } from "../../src/model/layers";
import type { DocumentRef, DocumentStorageMode, Project } from "../../src/model/types";
import { SCHEMA_VERSION } from "../../src/model/types";
import {
  documentStorage,
  isManagedDocument,
  outsideProjectReferences,
} from "../../src/features/sourceStorage";
import {
  describePackageFailure,
  documentArchivePaths,
  normalizePackageFailure,
  portableProjectJson,
  safeArchiveBase,
  validatePackagedProjectJson,
  validatePackageManifest,
  type PackageManifest,
} from "../../src/features/projectPackage/model";

const INTERNAL_MESSAGE =
  /Cannot read|Cannot convert|is not a function|undefined is not|Maximum call stack|Unexpected token/i;

function readRust(module: string): string {
  return readFileSync(resolve(__dirname, "..", "..", "src-tauri", "src", module), "utf8");
}

function rustConstant(module: string, name: string): number {
  const match = new RegExp(`const ${name}: u64 = ([0-9* ]+);`).exec(readRust(module));
  expect(match, `${module}::${name}`).not.toBeNull();
  return (match?.[1] ?? "0")
    .split("*")
    .map((part) => Number(part.trim()))
    .reduce((total, part) => total * part, 1);
}

function validManifest(): PackageManifest {
  return {
    format: "gridscalr-package",
    formatVersion: 1,
    createdAt: "2026-11-01T10:00:00.000Z",
    appVersion: "0.23.0",
    projectFile: "Level 01.gridscalr",
    projectSha256: "d".repeat(64),
    projectSchema: SCHEMA_VERSION,
    documents: [
      { file: "documents/Plan.pdf", sha256: "a".repeat(64), sizeBytes: 1200, kind: "pdf" },
    ],
    exports: [],
    sourceScans: [],
  };
}

function manifestWith(prefix: string, file: string): PackageManifest {
  const manifest = validManifest();
  const entry = {
    file,
    sha256: "a".repeat(64),
    sizeBytes: 10,
    kind: prefix === "source-scans/" ? "tiff" : "pdf",
  };
  manifest.documents = prefix === "documents/" ? [entry] : [];
  manifest.exports = prefix === "exports/" ? [entry] : [];
  manifest.sourceScans = prefix === "source-scans/" ? [entry] : [];
  return manifest;
}

/** C0, DEL and C1, the characters Rust `char::is_control()` rejects. */
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || (code >= 127 && code <= 159);
  });
}

/** An independent reading of "one file inside the prefix", not the guard itself. */
function isSafeEntry(file: string, prefix: string): boolean {
  if (!file.startsWith(prefix)) return false;
  const leaf = file.slice(prefix.length);
  return (
    leaf.length > 0 &&
    leaf.length < 241 &&
    !leaf.includes("/") &&
    !leaf.includes("\\") &&
    leaf !== "." &&
    leaf !== ".." &&
    !hasControlCharacter(file)
  );
}

function referenceDocument(name: string, path: string | null): DocumentRef {
  return { ...defaultDocument(name, 1), path, sha256: "a".repeat(64), sizeBytes: 100 };
}

function managedDocument(name: string, folder: string, original: string): DocumentRef {
  const stem = name.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const file = `${safeArchiveBase(stem, "Drawing")}-aaaaaaaa.pdf`;
  return {
    ...defaultDocument(name, 1),
    storage: "managed",
    path: `${folder}/${file}`,
    relativePath: `Level 01.drawings/${file}`,
    originalPath: original,
    originalSha256: "b".repeat(64),
  };
}

describe("protected source path corpus", () => {
  it("refuses every spelling of a protected source drawing", () => {
    for (const source of PROTECTED_SOURCE_PATHS) {
      for (const spelling of pathSpellings(source)) {
        expect(findProtectedPath(spelling, [source]), `${source} as ${spelling}`).toBe(source);
        expect(() => assertWritablePath(spelling, [source]), spelling).toThrow(/source drawing/i);
      }
      expect(() => assertWritablePath(siblingPath(source), [source])).not.toThrow();
    }
  });

  it("refuses every destination inside a managed-copy folder", () => {
    const rng = prng(0x17_101);
    for (const source of PROTECTED_SOURCE_PATHS) {
      const projectFolder = source.replace(/[\\/][^\\/]+$/, "");
      const folder = `${projectFolder}/Level 01.drawings`;
      expect(findProtectedPath(folder, [folder])).toBe(folder);
      for (let index = 0; index < 20; index += 1) {
        const leaf = `${safeArchiveBase(adversarialName(rng), "Drawing")}-${index}.pdf`;
        for (const spelling of pathSpellings(`${folder}/${leaf}`)) {
          expect(findProtectedPath(spelling, [folder]), spelling).toBe(folder);
          expect(() => assertWritablePath(spelling, [folder])).toThrow(/source drawing/i);
        }
      }
    }
  });

  it("rejects every drive-relative spelling instead of guessing", () => {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    for (const letter of letters) {
      for (const tail of ["Plan.pdf", "..\\Plan.pdf", "drawings/plan.pdf", ""]) {
        expect(() =>
          assertWritablePath(`${letter.toUpperCase()}:${tail}`, PROTECTED_SOURCE_PATHS),
        ).toThrow(/drive-relative|ambiguous/i);
      }
    }
    // A rooted drive path is not ambiguous and must stay usable.
    expect(() =>
      assertWritablePath("C:/Exports/Plan-markups.pdf", PROTECTED_SOURCE_PATHS),
    ).not.toThrow();
  });

  it("keeps the app's own managed-copy destination writable", () => {
    const projectPath = "/home/ana/Projects/Level 01.gridscalr";
    const folder = managedDrawingsFolder(projectPath);
    expect(folder).toBe("/home/ana/Projects/Level 01.drawings");
    expect(isPathInside(folder!, "/home/ana/Projects")).toBe(true);

    const project = withTestPageIds(
      createProject(referenceDocument("Plan.pdf", "/archive/Plan.pdf")),
    );
    project.documents.push(managedDocument("Copied.pdf", folder!, "/archive/OneDrive/Copied.pdf"));
    const protectedPaths = managedCopyProtectedPaths(project, projectPath);

    expect(protectedPaths).not.toContain(folder);
    // The copy target folder is writable, every source and provenance path is not.
    expect(() => assertWritablePath(`${folder}/Second-bbbbbbbb.pdf`, protectedPaths)).not.toThrow();
    expect(() => assertWritablePath(`${folder}/Copied-aaaaaaaa.pdf`, protectedPaths)).toThrow(
      /source drawing/i,
    );
    expect(() => assertWritablePath("/archive/OneDrive/Copied.pdf", protectedPaths)).toThrow(
      /source drawing/i,
    );
    expect(() => assertWritablePath("/archive/Plan.pdf", protectedPaths)).toThrow(
      /source drawing/i,
    );
  });

  it("derives an inside-the-project drawings folder for every project shape", () => {
    const cases = [
      ["/home/ana/Projects/Level 01.gridscalr", "/home/ana/Projects"],
      ["C:\\Work\\Level 01.gridscalr", "C:\\Work"],
      [String.raw`\\server\share\Level 01.gridscalr`, String.raw`\\server\share`],
    ] as const;
    for (const [projectPath, projectFolder] of cases) {
      const folder = managedDrawingsFolder(projectPath);
      expect(folder, projectPath).not.toBeNull();
      expect(isPathInside(folder!, projectFolder), `${projectPath} → ${folder}`).toBe(true);
      expect(folder!.toLowerCase().endsWith(".drawings"), folder!).toBe(true);
    }
    expect(managedDrawingsFolder(null)).toBeNull();
  });

  it("protects every generated document path and provenance path", () => {
    const rng = prng(0x17_102);
    const projectPath = "/home/ana/Projects/Level 01.gridscalr";
    const folder = managedDrawingsFolder(projectPath)!;
    for (let index = 0; index < 60; index += 1) {
      const project = withTestPageIds(createProject(referenceDocument("Plan.pdf", null)));
      project.documents = Array.from({ length: 1 + integer(rng, 4) }, (_, position) => {
        const source = pick(rng, PROTECTED_SOURCE_PATHS);
        return pick(rng, [true, false])
          ? referenceDocument(`Doc ${position}.pdf`, source)
          : managedDocument(`Doc ${position}.pdf`, folder, pick(rng, PROTECTED_SOURCE_PATHS));
      });
      const paths = sourceDocumentPaths(project, projectPath);
      expect(new Set(paths).size, corpusLabel(0x17_102, index)).toBe(paths.length);
      expect(
        paths.every((path) => Boolean(path.trim())),
        corpusLabel(0x17_102, index),
      ).toBe(true);
      for (const document of project.documents) {
        if (document.path) expect(() => assertWritablePath(document.path!, paths)).toThrow();
        if (document.originalPath) {
          expect(() => assertWritablePath(document.originalPath!, paths)).toThrow();
        }
      }
      // Every source stays protected for the copy command, and its own target
      // folder stays writable (the defect this corpus found, F-050).
      const copyPaths = managedCopyProtectedPaths(project, projectPath);
      expect(() => assertWritablePath(`${folder}/Fresh-cccccccc.pdf`, copyPaths)).not.toThrow();
      for (const document of project.documents) {
        if (document.path) expect(() => assertWritablePath(document.path!, copyPaths)).toThrow();
        if (document.originalPath) {
          expect(() => assertWritablePath(document.originalPath!, copyPaths)).toThrow();
        }
      }
    }
  });
});

describe("package entry corpus", () => {
  it("accepts only one safe file per archive prefix", () => {
    const rng = prng(0x17_201);
    let accepted = 0;
    let rejected = 0;
    for (let index = 0; index < 400; index += 1) {
      const prefix = pick(rng, ["documents/", "exports/", "source-scans/"]);
      const file =
        rng() < 0.5
          ? adversarialName(rng, 4)
          : `${prefix}${pick(rng, ["Plan.pdf", "Översiktsplan 1.pdf", "CON.pdf", `${"a".repeat(200)}.pdf`])}`;
      let manifest: PackageManifest;
      try {
        manifest = validatePackageManifest(manifestWith(prefix, file));
      } catch (error) {
        rejected += 1;
        expect(error, file).toBeInstanceOf(Error);
        expect((error as Error).name, file).toBe("Error");
        expect((error as Error).message, file).not.toMatch(INTERNAL_MESSAGE);
        continue;
      }
      accepted += 1;
      const entry = [...manifest.documents, ...manifest.exports, ...manifest.sourceScans][0];
      expect(isSafeEntry(entry.file, prefix), `${file} → ${entry.file}`).toBe(true);
    }
    expect(accepted + rejected).toBe(400);
    expect(rejected).toBeGreaterThan(100);
    expect(accepted).toBeGreaterThan(50);
  });

  it("rejects traversal, UNC, drive, control and nested entry names", () => {
    const unsafe = [
      "../Plan.pdf",
      "documents/../Plan.pdf",
      "documents/./Plan.pdf",
      "documents//Plan.pdf",
      "documents/.hidden/Plan.pdf",
      "documents\\Plan.pdf",
      "/documents/Plan.pdf",
      String.raw`\\?\C:\documents\Plan.pdf`,
      "C:/documents/Plan.pdf",
      "//server/share/Plan.pdf",
      "documents/\u0000Plan.pdf",
      "documents/\u001fPlan.pdf",
      "documents/Plan.pdf/",
      "source-scans/Plan.pdf",
    ];
    for (const file of unsafe) {
      for (const prefix of ["documents/", "exports/", "source-scans/"]) {
        if (isSafeEntry(file, prefix)) continue;
        expect(() => validatePackageManifest(manifestWith(prefix, file)), file).toThrow(Error);
      }
    }
  });

  it("rejects duplicate entries under case variants", () => {
    const manifest = validManifest();
    for (const variant of caseVariants("documents/Plan.pdf")
      .filter((name) => name.startsWith("documents/"))
      .slice(1)) {
      const candidate = structuredClone(manifest);
      candidate.documents.push({ ...candidate.documents[0], file: variant });
      expect(() => validatePackageManifest(candidate), variant).toThrow(/more than once/i);
    }
  });

  it("rejects oversized and non-integer sizes without an internal error", () => {
    const values = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "10", null, undefined];
    for (const value of values) {
      const candidate = validManifest();
      (candidate.documents[0] as { sizeBytes: unknown }).sizeBytes = value;
      expect(() => validatePackageManifest(candidate), String(value)).toThrow(Error);
    }
    const huge = validManifest();
    huge.documents[0].sizeBytes = Number.MAX_SAFE_INTEGER;
    // The frontend records the declared size; the extraction guard enforces the cap.
    expect(() => validatePackageManifest(huge)).not.toThrow();
    expect(rustConstant("package.rs", "MAX_ENTRY_BYTES")).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("derives one safe documents/ leaf for every generated drawing name", () => {
    const rng = prng(0x17_202);
    for (let index = 0; index < 120; index += 1) {
      const project = withTestPageIds(createProject(referenceDocument("Plan.pdf", null)));
      project.documents = Array.from({ length: 1 + integer(rng, 6) }, (_, position) => ({
        ...defaultDocument(adversarialName(rng) || `Doc ${position}.pdf`, 1),
        id: `doc_${position}`,
        path: pick(rng, PROTECTED_SOURCE_PATHS),
      }));
      const values = [...documentArchivePaths(project).values()];
      for (const value of values) {
        expect(value.startsWith("documents/"), value).toBe(true);
        expect(isSafeEntry(value, "documents/"), value).toBe(true);
      }
    }
  });
});

describe("packaged project corpus", () => {
  it("never sends an absolute or provenance path inside a package", () => {
    const rng = prng(0x17_301);
    for (let index = 0; index < 60; index += 1) {
      const source = pick(rng, PROTECTED_SOURCE_PATHS);
      const original = pick(rng, PROTECTED_SOURCE_PATHS);
      const document: DocumentRef = {
        ...referenceDocument("Plan.pdf", source),
        relativePath: "../drawings/Plan.pdf",
        storage: pick(rng, ["reference", "managed"] as DocumentStorageMode[]),
        originalPath: original,
        originalSha256: "b".repeat(64),
      };
      const project = withTestPageIds(createProject(document));
      const paths = documentArchivePaths(project);
      const json = portableProjectJson(project, paths);
      for (const path of [source, original, "../drawings/Plan.pdf"]) {
        expect(json, `${corpusLabel(0x17_301, index)} ${path}`).not.toContain(
          JSON.stringify(path).slice(1, -1),
        );
      }
      const packaged = JSON.parse(json) as Project;
      expect(packaged.documents[0].path).toBeNull();
      expect(packaged.documents[0].originalPath).toBeNull();
      expect(packaged.documents[0].relativePath).toBe(paths.get(document.id));
      expect(() => validatePackagedProjectJson(json)).not.toThrow();
    }
  });

  it("accepts only documents/<leaf> links in an extracted project", () => {
    const rng = prng(0x17_302);
    for (let index = 0; index < 200; index += 1) {
      const relativePath = pick(rng, [
        adversarialName(rng, 3),
        `documents/${safeArchiveBase(adversarialName(rng), "Drawing")}.pdf`,
        `../documents/${adversarialName(rng, 2)}`,
        `${adversarialName(rng, 2)}/Plan.pdf`,
      ]);
      const json = JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        documents: [{ path: null, relativePath, kind: "pdf" }],
      });
      try {
        validatePackagedProjectJson(json);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe("Error");
        continue;
      }
      expect(isSafeEntry(relativePath, "documents/"), relativePath).toBe(true);
    }
  });
});

describe("project document and page path corpus", () => {
  it("keeps document and page references valid for adversarial paths", () => {
    const rng = prng(0x17_401);
    for (let index = 0; index < 40; index += 1) {
      const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
      const document = project.documents[0];
      document.path = pick(rng, [...PROTECTED_SOURCE_PATHS, adversarialName(rng), null]);
      document.relativePath = pick(rng, [
        "../../drawings/Plan.pdf",
        adversarialName(rng),
        "Level 01.drawings/Plan-aaaaaaaa.pdf",
        null,
      ]);
      document.originalPath = pick(rng, [pick(rng, PROTECTED_SOURCE_PATHS), null]);
      document.storage = pick(rng, ["reference", "managed"] as DocumentStorageMode[]);
      // A managed PDF must keep a relative copy path; the predicate below proves
      // the validator reports the broken variant instead of dropping it.
      if (document.storage === "managed" && !document.relativePath) {
        document.relativePath = "Level 01.drawings/Plan-aaaaaaaa.pdf";
      }
      document.sha256 = pick(rng, ["", "a".repeat(64), adversarialName(rng)]);

      const parsed = parseProject(serializeProject(project));
      const errors = validateProject(parsed).filter((issue) => issue.severity === "error");
      expect(errors, corpusLabel(0x17_401, index)).toEqual([]);

      const documentIds = parsed.documents.map((entry) => entry.id);
      expect(new Set(documentIds).size, corpusLabel(0x17_401, index)).toBe(documentIds.length);
      for (const page of parsed.pages) {
        expect(documentIds, `page ${page.id}`).toContain(page.documentId);
      }
      for (const entry of parsed.documents) {
        expect(entry.path === null || typeof entry.path === "string").toBe(true);
        expect(entry.relativePath === null || typeof entry.relativePath === "string").toBe(true);
      }
      const paths = sourceDocumentPaths(parsed, "/home/ana/Projects/Level 01.gridscalr");
      expect(new Set(paths).size).toBe(paths.length);
      for (const entry of parsed.documents) {
        // A spelling that normalises to no file at all (`/`) owns nothing to
        // protect; every real source path must be refused.
        if (entry.path && pathComparisonKey(entry.path)) {
          expect(() => assertWritablePath(entry.path!, paths)).toThrow();
        }
        if (entry.originalPath && pathComparisonKey(entry.originalPath)) {
          expect(() => assertWritablePath(entry.originalPath!, paths)).toThrow();
        }
      }
    }
  });

  it("reports truncated project JSON as an invalid file, never a type error", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
    const json = serializeProject(project);
    for (const offset of truncationOffsets(json.length)) {
      let error: unknown = null;
      try {
        parseProject(json.slice(0, offset));
      } catch (caught) {
        error = caught;
      }
      expect(error, `offset ${offset}`).toBeInstanceOf(Error);
      expect((error as Error).name, `offset ${offset}`).toBe("Error");
      expect((error as Error).message).toBe(t("projectFile.invalidJson"));
    }
  });
});

describe("source-storage mode corpus", () => {
  it("treats only an explicit managed mode as a managed copy", () => {
    const values: (DocumentStorageMode | undefined)[] = [
      undefined,
      "reference",
      "managed",
      "Managed" as DocumentStorageMode,
      "package" as DocumentStorageMode,
    ];
    for (const value of values) {
      const document = { ...defaultDocument("Plan.pdf", 1), storage: value };
      expect(documentStorage(document), String(value)).toBe(
        value === "managed" ? "managed" : "reference",
      );
      expect(isManagedDocument(document), String(value)).toBe(value === "managed");
    }
  });

  it("flags outside reference drawings but never a managed copy", () => {
    const projectPath = "/home/ana/Projects/Level 01.gridscalr";
    const project = createProject();
    project.documents = [
      { ...referenceDocument("Inside.pdf", "/home/ana/Projects/Inside.pdf"), id: "doc_inside" },
      { ...referenceDocument("Outside.pdf", "/home/ana/Share/Outside.pdf"), id: "doc_outside" },
      {
        ...referenceDocument("Relative.pdf", null),
        id: "doc_relative",
        relativePath: "../../Share/Relative.pdf",
      },
      {
        ...managedDocument(
          "Copy.pdf",
          "/home/ana/Projects/Level 01.drawings",
          "/home/ana/Share/C.pdf",
        ),
        id: "doc_managed",
        path: "/home/ana/Projects/Level 01.drawings/Copy-aaaaaaaa.pdf",
      },
    ];
    const flagged = outsideProjectReferences(project, projectPath).map(
      (reference) => reference.documentId,
    );
    expect(flagged).toContain("doc_outside");
    expect(flagged).toContain("doc_relative");
    expect(flagged).not.toContain("doc_inside");
    expect(flagged).not.toContain("doc_managed");
  });
});

describe("input limit and boundary guard inventory", () => {
  it("keeps the frontend limits equal to the Rust guards", () => {
    expect(MAX_PROJECT_BYTES).toBe(rustConstant("path_guard.rs", "MAX_PROJECT_BYTES"));
    expect(MAX_SOURCE_BYTES).toBe(rustConstant("path_guard.rs", "MAX_SOURCE_BYTES"));
    expect(MAX_PACKAGE_TOTAL_BYTES).toBe(rustConstant("package.rs", "MAX_TOTAL_BYTES"));
  });

  it("keeps the Rust copy and extraction guards wired", () => {
    const copy = readRust("source_copy.rs");
    expect(copy).toMatch(/ensure_inside_root\(\s*&drawings_folder,\s*&folder,\s*"unsafePath"\s*\)/);
    const archive = readRust("package.rs");
    expect(archive).toMatch(
      /let name = entry\.name\(\)\?\.to_string\(\);\s*validate_entry_name\(&name\)\?/,
    );
    expect(archive).toMatch(/validate_entry_name\(&entry\.name\)\?/);
    const symlinkChecks = archive.match(/is_symlink\(\)/g) ?? [];
    expect(symlinkChecks.length, "inspect and extract both reject symlinks").toBeGreaterThanOrEqual(
      2,
    );
  });

  it("normalises arbitrary failures without throwing or hiding the kind", () => {
    const values: unknown[] = [
      null,
      undefined,
      0,
      "",
      {},
      { kind: "cancelled" },
      { kind: "missingSource", files: [] },
      { kind: "checksumMismatch", files: [] },
      { kind: "destinationExists", path: "/tmp/x" },
      { kind: "sourceOverwrite" },
      { kind: "insufficientSpace", requiredBytes: 1, availableBytes: 0 },
      { kind: "invalidPackage", message: "" },
      { kind: "io", message: "denied" },
      { kind: "unknown", message: "" },
      { kind: "not-a-kind" },
      new Error("plain failure"),
    ];
    for (const value of values) {
      const failure = normalizePackageFailure(value);
      expect(typeof failure.kind).toBe("string");
      expect(() => describePackageFailure(failure)).not.toThrow();
      expect(describePackageFailure(failure).length, JSON.stringify(value)).toBeGreaterThan(0);
    }
    expect(describeCommandError({ code: "sourceOverwrite", detail: "" })).toMatch(
      /source drawing/i,
    );
    expect(describeCommandError({ code: "not-a-code", detail: "x" })).toBeNull();
    expect(describeCommandError("sourceOverwrite")).toBeNull();
  });
});
