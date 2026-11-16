import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProject, parseProjectWithReport, serializeProject } from "../src/io/projectFile";
import {
  DERIVED_PDF_CONVERTER_VERSION,
  derivedPdfCacheIsCurrent,
  isDerivedPdfCacheRef,
} from "../src/model/derivedPdf";
import { validateProject } from "../src/model/integrity";
import type { DerivedPdfCacheRef, Project } from "../src/model/types";
import { SCHEMA_VERSION } from "../src/model/types";

const SCHEMA_26 = readFileSync(
  new URL("../fixtures/legacy/schema-26.gridscalr", import.meta.url),
  "utf8",
);
const SCHEMA_27 = readFileSync(
  new URL("../fixtures/legacy/schema-27.gridscalr", import.meta.url),
  "utf8",
);
const SCAN_SHA = "b".repeat(64);
const CACHE_MARKER: DerivedPdfCacheRef = {
  sourceSha256: SCAN_SHA,
  converterVersion: DERIVED_PDF_CONVERTER_VERSION,
  pageCount: 1,
  relativePath: "schema-27.drawings/derived/derived-scan-bbbbbbbb.pdf",
};

function rawFixture(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

function scanDocument(raw: Record<string, unknown>): Record<string, unknown> {
  const documents = raw.documents as Array<Record<string, unknown>>;
  return documents.find((document) => document.kind === "tiff")!;
}

function scanOf(project: Project) {
  return project.documents.find((document) => document.kind === "tiff")!;
}

/** A stable JSON string: `serializeProject` stamps `updatedAt` on purpose. */
function stableJson(project: Project): string {
  return JSON.stringify({ ...project, updatedAt: "fixed" });
}

function issueCodes(project: Project): string[] {
  return validateProject(project).map((issue) => issue.code);
}

describe("schema 27 derived-PDF cache marker", () => {
  it("keeps a schema 27 marker through a round trip on the current schema", () => {
    expect(SCHEMA_VERSION).toBe(28);
    const { project, report } = parseProjectWithReport(SCHEMA_27);
    expect(report.migratedFrom).toBe(27);
    const scan = scanOf(project);
    expect(scan.embeddedPdf).toBeUndefined();
    expect(scan.derivedPdf).toEqual(CACHE_MARKER);
    expect(report.dropped).toEqual([]);
    expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([]);

    const roundTrip = parseProjectWithReport(serializeProject(project)).project;
    expect(scanOf(roundTrip).derivedPdf).toEqual(CACHE_MARKER);
    expect(stableJson(roundTrip)).toBe(stableJson(parseProjectWithReport(SCHEMA_27).project));
  });

  it("migrates a schema 27 project deterministically", () => {
    const first = parseProjectWithReport(SCHEMA_27).project;
    const second = parseProjectWithReport(SCHEMA_27).project;
    expect(stableJson(second)).toBe(stableJson(first));
    expect(stableJson(parseProjectWithReport(serializeProject(first)).project)).toBe(
      stableJson(first),
    );
  });

  it("keeps a schema 26 TIF's embedded PDF byte for byte and adds no marker", () => {
    const raw = rawFixture(SCHEMA_26);
    const { project, report } = parseProjectWithReport(SCHEMA_26);
    expect(report.migratedFrom).toBe(26);
    expect(scanOf(project).embeddedPdf).toBe(scanDocument(raw).embeddedPdf);
    expect(scanOf(project).embeddedPdf).toBe("JVBERi0xLjQK");
    expect(scanOf(project).derivedPdf).toBeUndefined();
    expect(report.dropped).toEqual([]);
    expect(issueCodes(project)).not.toContain("tiffDocumentWithoutDerivedPdf");
  });

  it("still accepts an embedded TIF at schema 27 and does not invent a marker", () => {
    const raw = rawFixture(SCHEMA_27);
    const scan = scanDocument(raw);
    delete scan.derivedPdf;
    scan.embeddedPdf = "JVBERi0xLjQK";
    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(scanOf(project).embeddedPdf).toBe("JVBERi0xLjQK");
    expect(scanOf(project).derivedPdf).toBeUndefined();
    expect(report.dropped).toEqual([]);
    expect(issueCodes(project)).not.toContain("tiffDocumentWithoutDerivedPdf");
  });

  it("keeps the embedded bytes and reports a marker when both forms are present", () => {
    const raw = rawFixture(SCHEMA_26);
    scanDocument(raw).derivedPdf = CACHE_MARKER;
    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(scanOf(project).embeddedPdf).toBe("JVBERi0xLjQK");
    expect(scanOf(project).derivedPdf).toBeUndefined();
    expect(report.repaired).toContainEqual({ code: "repairedDerivedPdf", count: 1 });
  });

  it("does not trust a marker in pre-27 data and refuses a TIF with no derived source", () => {
    const raw = rawFixture(SCHEMA_26);
    const scan = scanDocument(raw);
    delete scan.embeddedPdf;
    scan.derivedPdf = CACHE_MARKER;
    // Schema 26 did not have the field, so the marker is ignored; with no
    // embedded PDF left the document has no renderable derived source and keeps
    // the existing hard error instead of opening a blank page.
    expect(() => parseProject(JSON.stringify(raw))).toThrow(/no derived PDF/i);
  });

  it("reports a malformed marker and keeps the document", () => {
    const cases: unknown[] = [
      { ...CACHE_MARKER, sourceSha256: "not-a-hash" },
      { ...CACHE_MARKER, converterVersion: 0 },
      { ...CACHE_MARKER, converterVersion: 1.5 },
      { ...CACHE_MARKER, pageCount: 0 },
      { ...CACHE_MARKER, relativePath: "" },
      { ...CACHE_MARKER, relativePath: "/etc/passwd" },
      { ...CACHE_MARKER, relativePath: "C:/cache/derived.pdf" },
      { ...CACHE_MARKER, relativePath: "../outside/derived.pdf" },
      { ...CACHE_MARKER, relativePath: "nested/./derived.pdf" },
      "a string is not a marker",
    ];
    for (const derivedPdf of cases) {
      const raw = rawFixture(SCHEMA_27);
      const scan = scanDocument(raw);
      scan.derivedPdf = derivedPdf;
      scan.embeddedPdf = "JVBERi0xLjQK";
      const { project, report } = parseProjectWithReport(JSON.stringify(raw));
      expect(scanOf(project).derivedPdf).toBeUndefined();
      expect(scanOf(project).embeddedPdf).toBe("JVBERi0xLjQK");
      expect(report.dropped).toContainEqual({ code: "droppedDerivedPdf", count: 1 });
      expect(issueCodes(project)).not.toContain("tiffDocumentWithoutDerivedPdf");
    }
  });

  it("reports a missing or stale cache marker instead of dropping the document", () => {
    const project = parseProjectWithReport(SCHEMA_27).project;
    const scan = scanOf(project);
    const marker = scan.derivedPdf!;

    scan.derivedPdf = { ...marker, sourceSha256: "c".repeat(64) };
    expect(issueCodes(project)).toContain("derivedPdfCacheStale");
    expect(scanOf(project).derivedPdf?.sourceSha256).toBe("c".repeat(64));

    scan.derivedPdf = { ...marker, converterVersion: marker.converterVersion + 1 };
    expect(issueCodes(project)).toContain("derivedPdfCacheStale");

    scan.derivedPdf = { ...marker, pageCount: marker.pageCount + 1 };
    expect(issueCodes(project)).toContain("derivedPdfCacheStale");

    scan.derivedPdf = { ...marker, relativePath: "/absolute/derived.pdf" };
    expect(issueCodes(project)).toContain("invalidDerivedPdfCache");

    scan.derivedPdf = undefined;
    const missing = validateProject(project).find(
      (issue) => issue.code === "tiffDocumentWithoutDerivedPdf",
    );
    expect(missing?.severity).toBe("error");
    expect(missing?.entity).toEqual({ kind: "document", id: scan.id });
  });

  it("reuses a cache only while the source hash, converter version and page count match", () => {
    const key = { sourceSha256: SCAN_SHA, pageCount: 1 };
    expect(derivedPdfCacheIsCurrent(CACHE_MARKER, key)).toBe(true);
    expect(
      derivedPdfCacheIsCurrent(CACHE_MARKER, { ...key, sourceSha256: SCAN_SHA.toUpperCase() }),
    ).toBe(true);
    expect(derivedPdfCacheIsCurrent(CACHE_MARKER, { ...key, sourceSha256: "c".repeat(64) })).toBe(
      false,
    );
    expect(derivedPdfCacheIsCurrent(CACHE_MARKER, { ...key, pageCount: 2 })).toBe(false);
    expect(derivedPdfCacheIsCurrent(CACHE_MARKER, key, CACHE_MARKER.converterVersion + 1)).toBe(
      false,
    );
  });

  it("accepts only a complete, project-relative marker shape", () => {
    expect(isDerivedPdfCacheRef(CACHE_MARKER)).toBe(true);
    expect(isDerivedPdfCacheRef({ ...CACHE_MARKER, sourceSha256: SCAN_SHA.toUpperCase() })).toBe(
      true,
    );
    expect(isDerivedPdfCacheRef({ ...CACHE_MARKER, relativePath: "nested\\derived.pdf" })).toBe(
      true,
    );
    expect(isDerivedPdfCacheRef({ ...CACHE_MARKER, pageCount: 0 })).toBe(false);
    expect(isDerivedPdfCacheRef({ ...CACHE_MARKER, relativePath: "nested\\..\\derived.pdf" })).toBe(
      false,
    );
    expect(isDerivedPdfCacheRef(null)).toBe(false);
    expect(isDerivedPdfCacheRef([])).toBe(false);
  });
});
