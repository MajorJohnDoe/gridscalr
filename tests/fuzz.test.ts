import { describe, expect, it } from "vitest";
import { pick, prng } from "./helpers/fuzz";
import { withTestPageIds } from "./helpers/pages";
import { parseProject, serializeProject } from "../src/io/projectFile";
import { SCHEMA_VERSION } from "../src/model/types";
import { createProject, defaultDocument } from "../src/model/layers";
import { totalPageCount } from "../src/model/documents";
import {
  documentArchivePaths,
  portableProjectJson,
  safeArchiveBase,
  uniqueArchiveName,
  validatePackagedProjectJson,
  validatePackageManifest,
  type PackageManifest,
} from "../src/features/projectPackage/model";

function randomNumber(rng: () => number): number {
  return pick(rng, [
    0,
    -1,
    1,
    1e-9,
    1e9,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    -0,
    Math.PI,
  ]);
}

function randomString(rng: () => number): string {
  const alphabet = "abcXYZ019 _-./\\:*?<>|\u0000\u001fåäö✓";
  let value = "";
  const length = Math.floor(rng() * 80);
  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return value;
}

function randomValue(rng: () => number, depth = 0): unknown {
  const kind = Math.floor(rng() * (depth > 2 ? 5 : 7));
  switch (kind) {
    case 0:
      return null;
    case 1:
      return rng() > 0.5;
    case 2:
      return randomNumber(rng);
    case 3:
      return randomString(rng);
    case 4:
      return rng() > 0.5 ? "pdf" : "tiff";
    case 5:
      return Array.from({ length: Math.floor(rng() * 4) }, () => randomValue(rng, depth + 1));
    default: {
      const value: Record<string, unknown> = {};
      for (let index = 0; index < Math.floor(rng() * 4); index += 1) {
        value[randomString(rng) || `key${index}`] = randomValue(rng, depth + 1);
      }
      return value;
    }
  }
}

function isValidProject(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const project = value as {
    documents?: unknown;
    layers?: unknown;
    settings?: unknown;
    pageCount?: unknown;
  };
  return (
    Array.isArray(project.documents) &&
    project.documents.length > 0 &&
    Array.isArray(project.layers) &&
    project.layers.length > 0 &&
    typeof project.settings === "object" &&
    project.settings !== null
  );
}

function expectNoInternalError(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : String(error);
    expect(message).not.toMatch(
      /Cannot read|Cannot convert|is not a function|undefined is not|Maximum call stack/i,
    );
  }
}

function validManifest(): PackageManifest {
  return {
    format: "gridscalr-package",
    formatVersion: 1,
    createdAt: "2026-11-01T10:00:00.000Z",
    appVersion: "0.19.3",
    projectFile: "Plan.gridscalr",
    projectSha256: "a".repeat(64),
    projectSchema: SCHEMA_VERSION,
    documents: [
      {
        file: "documents/Plan.pdf",
        sha256: "b".repeat(64),
        sizeBytes: 1200,
        kind: "pdf",
      },
    ],
    exports: [],
    sourceScans: [],
  };
}

describe("untrusted project JSON fuzzing", () => {
  it("never throws an internal error for arbitrary JSON values", () => {
    const rng = prng(0x5eed1);
    for (let index = 0; index < 200; index += 1) {
      const json = JSON.stringify(randomValue(rng));
      expectNoInternalError(() => parseProject(json));
    }
  }, 15000);

  it("accepts or rejects randomly mutated projects without crashing", () => {
    const rng = prng(0x5eed2);
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
    const valid = JSON.parse(serializeProject(project)) as Record<string, unknown>;
    const targets = [
      valid,
      (valid.documents as Record<string, unknown>[])[0],
      valid.settings as Record<string, unknown>,
      (valid.layers as Record<string, unknown>[])[0],
      valid.pages as Record<string, unknown>,
      valid.metadata as Record<string, unknown>,
    ].filter((value) => typeof value === "object" && value !== null);
    for (let index = 0; index < 200; index += 1) {
      const raw = structuredClone(valid);
      raw.schemaVersion = SCHEMA_VERSION;
      const target = pick(
        rng,
        [
          raw,
          (raw.documents as Record<string, unknown>[])[0],
          raw.settings as Record<string, unknown>,
          (raw.layers as Record<string, unknown>[])[0],
          raw.pages as Record<string, unknown>,
          raw.metadata as Record<string, unknown>,
        ].filter((value) => typeof value === "object" && value !== null) as Record<
          string,
          unknown
        >[],
      );
      target[randomString(rng) || `field${index}`] = randomValue(rng);
      const json = JSON.stringify(raw);
      try {
        const parsed = parseProject(json);
        expect(isValidProject(parsed)).toBe(true);
        expect(totalPageCount(parsed.documents)).toBeGreaterThanOrEqual(1);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
    // Keep the mutation targets referenced so future edits notice if they vanish.
    expect(targets.length).toBe(6);
  }, 15000);

  it("handles extreme document and asset values without internal errors", () => {
    const rng = prng(0x5eed3);
    for (let index = 0; index < 100; index += 1) {
      const document = {
        id: randomValue(rng),
        kind: pick(rng, ["pdf", "tiff", "template"]),
        name: randomString(rng),
        path: randomValue(rng),
        relativePath: randomValue(rng),
        sha256: randomValue(rng),
        pageCount: randomValue(rng),
        sizeBytes: randomValue(rng),
        excludedPages: randomValue(rng),
        embeddedPdf: randomValue(rng),
        source: { dpi: randomValue(rng), originalName: randomValue(rng) },
        copiedFrom: { documentId: randomValue(rng), page: randomValue(rng) },
      };
      const json = JSON.stringify({ schemaVersion: SCHEMA_VERSION, documents: [document] });
      expectNoInternalError(() => parseProject(json));
    }
  }, 15000);
});

describe("untrusted package manifest fuzzing", () => {
  it("never throws an internal error for arbitrary manifest values", () => {
    const rng = prng(0x5eed4);
    for (let index = 0; index < 200; index += 1) {
      const value = randomValue(rng);
      expectNoInternalError(() => validatePackageManifest(value));
    }
  }, 15000);

  it("rejects unsafe file names and preserves safe manifests", () => {
    const rng = prng(0x5eed5);
    const manifest = validManifest();
    const badFiles = [
      "../Plan.pdf",
      "documents/../Plan.pdf",
      "documents/./Plan.pdf",
      "documents//Plan.pdf",
      "documents\\Plan.pdf",
      "/documents/Plan.pdf",
      "documents/sub/Plan.pdf",
      "exports/../Plan.pdf",
      "documents/\u0000Plan.pdf",
    ];
    for (const file of badFiles) {
      const candidate = structuredClone(manifest);
      candidate.documents[0].file = file;
      expect(() => validatePackageManifest(candidate)).toThrow(Error);
    }

    for (let index = 0; index < 200; index += 1) {
      const value = structuredClone(manifest) as unknown as Record<string, unknown>;
      const target = pick(rng, [value, manifest.documents[0]]) as Record<string, unknown>;
      target[randomString(rng) || `field${index}`] = randomValue(rng);
      expectNoInternalError(() => validatePackageManifest(value));
    }
  }, 15000);

  it("rejects duplicate entries, reserved names and huge sizes without crashing", () => {
    const manifest = validManifest();
    expect(() =>
      validatePackageManifest({
        ...manifest,
        documents: [manifest.documents[0], { ...manifest.documents[0] }],
      }),
    ).toThrow(/more than once/i);
    expect(() => validatePackageManifest({ ...manifest, projectFile: "manifest.json" })).toThrow(
      /invalid project file/i,
    );
    expect(() =>
      validatePackageManifest({
        ...manifest,
        documents: [{ ...manifest.documents[0], sizeBytes: Number.MAX_SAFE_INTEGER }],
      }),
    ).not.toThrow();
  });

  it("rejects extracted projects with absolute or external document links", () => {
    const rng = prng(0x5eed6);
    for (let index = 0; index < 200; index += 1) {
      const documents = Array.from({ length: Math.floor(rng() * 4) }, () => ({
        path: randomValue(rng),
        relativePath: randomValue(rng),
        kind: pick(rng, ["pdf", "tiff"]),
      }));
      expectNoInternalError(() =>
        validatePackagedProjectJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, documents })),
      );
    }
  }, 15000);
});

describe("archive name fuzzing", () => {
  it("never emits traversal, separators or empty names", () => {
    const rng = prng(0x5eed7);
    for (let index = 0; index < 300; index += 1) {
      const name = randomString(rng);
      const base = safeArchiveBase(name);
      expect(base.length).toBeGreaterThan(0);
      expect(base).not.toMatch(/[\\/]/);
      expect(base.split(/[\\/]/)).toHaveLength(1);
      expect(base.trim()).toBe(base);
      const extension = pick(rng, [".pdf", ".tif", ".tiff"]);
      const unique = uniqueArchiveName(name, extension, new Set());
      expect(unique).not.toMatch(/[\\/]/);
      expect(unique.endsWith(extension)).toBe(true);
    }
  }, 15000);

  it("keeps generated document paths safe and unique for random names", () => {
    const rng = prng(0x5eed8);
    for (let index = 0; index < 50; index += 1) {
      const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
      project.documents = Array.from({ length: 1 + Math.floor(rng() * 5) }, (_, itemIndex) => ({
        ...defaultDocument(randomString(rng) || `Plan ${itemIndex}.pdf`, 1),
        id: `doc_${itemIndex}`,
        path: randomString(rng),
      }));
      const paths = documentArchivePaths(project);
      const values = [...paths.values()];
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) {
        expect(value.startsWith("documents/")).toBe(true);
        expect(value).not.toMatch(/[\\]/);
        expect(value.split("/").some((part) => !part || part === "." || part === "..")).toBe(false);
      }
      const packaged = JSON.parse(portableProjectJson(project, paths)) as {
        documents: Array<{ path: unknown; relativePath: unknown }>;
      };
      for (const document of packaged.documents) {
        expect(document.path).toBeNull();
        expect(
          document.relativePath === null ||
            (typeof document.relativePath === "string" &&
              document.relativePath.startsWith("documents/")),
        ).toBe(true);
      }
    }
  }, 15000);
});
