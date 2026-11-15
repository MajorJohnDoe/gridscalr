import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentRef, Project } from "../src/model/types";
import { DERIVED_PDF_CONVERTER_VERSION } from "../src/model/derivedPdf";
import {
  canCacheDerivedPdf,
  derivedCacheIsCurrent,
  evaluateDerivedCacheBudget,
  DERIVED_CACHE_BUDGET_BYTES,
} from "../src/features/derivedPdfCache/model";
import {
  derivedCachePath,
  derivedCacheBytes,
  loadDerivedPdfBytes,
  materializeProjectDerivedCaches,
  scanCandidates,
  storeDerivedPdfCache,
} from "../src/features/derivedPdfCache/lifecycle";

const platform = vi.hoisted(() => ({
  isTauri: true,
  pathExists: vi.fn(),
  readFileBytes: vi.fn(),
  fileSize: vi.fn(),
  sha256Hex: vi.fn(),
  pickDrawing: vi.fn(),
  formatBytes: vi.fn((value: number) => `${value} B`),
}));

const writer = vi.hoisted(() => ({ writeDerivedCache: vi.fn() }));

vi.mock("../src/io/platform", () => platform);
vi.mock("../src/features/derivedPdfCache/files", () => writer);

const SHA = "a".repeat(64);
const PROJECT = "/plans/Level 01.gridscalr";
const CACHE = "/plans/Level 01.derived/aaaaaaaaaaaaaaaa-v1-p1.pdf";
const SCAN = "/scans/Plan.tif";

function scanDocument(overrides: Partial<DocumentRef> = {}): DocumentRef {
  return {
    id: "doc_tif_1",
    kind: "tiff",
    name: "Plan.tif",
    path: SCAN,
    relativePath: null,
    sha256: SHA,
    pageCount: 1,
    sizeBytes: 1200,
    storage: "reference",
    embeddedPdf: "JVBERi0xLjQK",
    ...overrides,
  };
}

function markerDocument(): DocumentRef {
  const document = scanDocument();
  delete document.embeddedPdf;
  document.derivedPdf = {
    sourceSha256: SHA,
    converterVersion: DERIVED_PDF_CONVERTER_VERSION,
    pageCount: 1,
    relativePath: "Level 01.derived/aaaaaaaaaaaaaaaa-v1-p1.pdf",
  };
  return document;
}

function projectWith(...documents: DocumentRef[]): Project {
  return { id: "p", name: "Level 01", documents, layers: [], pages: [] } as unknown as Project;
}

function writeInfo(relativePath: string, sizeBytes = 4096) {
  return {
    destinationPath: `/plans/${relativePath}`,
    relativePath,
    sha256: "b".repeat(64),
    sizeBytes,
  };
}

beforeEach(() => {
  platform.pathExists.mockReset();
  platform.readFileBytes.mockReset();
  platform.fileSize.mockReset();
  platform.sha256Hex.mockReset();
  writer.writeDerivedCache.mockReset();
  platform.pathExists.mockResolvedValue(false);
  platform.fileSize.mockResolvedValue(null);
});

describe("derived-PDF cache model", () => {
  it("treats a marker as current only while hash, version and page count match", () => {
    const document = markerDocument();
    expect(derivedCacheIsCurrent(document)).toBe(true);
    document.pageCount = 2;
    expect(derivedCacheIsCurrent(document)).toBe(false);
    document.pageCount = 1;
    document.sha256 = "c".repeat(64);
    expect(derivedCacheIsCurrent(document)).toBe(false);
    document.sha256 = SHA;
    document.derivedPdf!.converterVersion = DERIVED_PDF_CONVERTER_VERSION + 1;
    expect(derivedCacheIsCurrent(document)).toBe(false);
  });

  it("warns at the derived-cache budget and reports the project limit as an overrun", () => {
    const limit = 256 * 1024 * 1024;
    expect(
      evaluateDerivedCacheBudget({ cacheBytes: 1024, projectBytes: 2048, projectLimitBytes: limit })
        .state,
    ).toBe("ok");
    expect(
      evaluateDerivedCacheBudget({
        cacheBytes: DERIVED_CACHE_BUDGET_BYTES,
        projectBytes: 1,
        projectLimitBytes: limit,
      }).state,
    ).toBe("warning");
    expect(
      evaluateDerivedCacheBudget({
        cacheBytes: DERIVED_CACHE_BUDGET_BYTES,
        projectBytes: limit,
        projectLimitBytes: limit,
      }).state,
    ).toBe("over");
  });

  it("resolves a marker path only inside the project folder", () => {
    const document = markerDocument();
    expect(derivedCachePath(document, PROJECT)).toBe(
      "/plans/Level 01.derived/aaaaaaaaaaaaaaaa-v1-p1.pdf",
    );
    expect(derivedCachePath(document, null)).toBeNull();
    delete document.derivedPdf;
    expect(derivedCachePath(document, PROJECT)).toBeNull();
  });

  it("lists the stored scan before the relative fallback", () => {
    const document = markerDocument();
    document.relativePath = "scans/Plan.tif";
    expect(scanCandidates(document, PROJECT)).toEqual([SCAN, "/plans/scans/Plan.tif"]);
  });
});

describe("derived-PDF cache lifecycle", () => {
  it("reuses a current cache without touching the scan", async () => {
    const document = markerDocument();
    platform.pathExists.mockResolvedValue(true);
    platform.readFileBytes.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const resolved = await loadDerivedPdfBytes(document, PROJECT);
    expect(resolved?.source).toBe("cache");
    expect(platform.readFileBytes).toHaveBeenCalledWith(CACHE);
    expect(platform.sha256Hex).not.toHaveBeenCalled();
  });

  it("rebuilds silently when the cache is missing and the scan is reachable", async () => {
    const fixture = new Uint8Array(
      await readFile(path.resolve(__dirname, "../fixtures/tiff/rgb8-deflate.tif")),
    );
    const document = markerDocument();
    platform.pathExists.mockImplementation(async (candidate: string) => candidate === SCAN);
    platform.readFileBytes.mockImplementation(async (candidate: string) => {
      if (candidate === SCAN) return fixture;
      throw new Error("cache is missing");
    });
    platform.sha256Hex.mockResolvedValue(SHA);
    writer.writeDerivedCache.mockResolvedValue(writeInfo("Level 01.derived/fresh.pdf"));

    const resolved = await loadDerivedPdfBytes(document, PROJECT);
    expect(resolved?.source).toBe("rebuilt");
    expect(resolved?.bytes.byteLength).toBeGreaterThan(0);
    expect(document.derivedPdf?.relativePath).toBe("Level 01.derived/fresh.pdf");
    expect(writer.writeDerivedCache).toHaveBeenCalledOnce();
    expect(writer.writeDerivedCache.mock.calls[0][0]).toMatchObject({
      projectPath: PROJECT,
      sourceSha256: SHA,
      pageCount: 1,
      converterVersion: DERIVED_PDF_CONVERTER_VERSION,
    });
  });

  it("returns nothing when both the cache and the scan are missing", async () => {
    const document = markerDocument();
    platform.pathExists.mockResolvedValue(false);
    expect(await loadDerivedPdfBytes(document, PROJECT)).toBeNull();
    expect(writer.writeDerivedCache).not.toHaveBeenCalled();
  });

  it("refuses to rebuild from a scan whose checksum does not match", async () => {
    const fixture = new Uint8Array(
      await readFile(path.resolve(__dirname, "../fixtures/tiff/rgb8-deflate.tif")),
    );
    const document = markerDocument();
    platform.pathExists.mockImplementation(async (candidate: string) => candidate === SCAN);
    platform.readFileBytes.mockImplementation(async (candidate: string) => {
      if (candidate === SCAN) return fixture;
      throw new Error("cache is missing");
    });
    platform.sha256Hex.mockResolvedValue("d".repeat(64));
    expect(await loadDerivedPdfBytes(document, PROJECT)).toBeNull();
    expect(writer.writeDerivedCache).not.toHaveBeenCalled();
  });

  it("opens a cache whose only mismatch is the converter version", async () => {
    const document = markerDocument();
    document.derivedPdf!.converterVersion = DERIVED_PDF_CONVERTER_VERSION + 1;
    platform.pathExists.mockResolvedValue(true);
    platform.readFileBytes.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    // A reachable scan is not available, so the drawing revision is trusted.
    platform.sha256Hex.mockResolvedValue("e".repeat(64));
    const resolved = await loadDerivedPdfBytes(document, PROJECT);
    expect(resolved?.source).toBe("cache");
  });

  it("never gives a passthrough scan a cache entry", async () => {
    const document = scanDocument({
      source: { format: "tiff", dpi: [400, 400], originalName: "Plan.tif", passthrough: true },
    });
    expect(canCacheDerivedPdf(document)).toBe(false);
    const fixture = new Uint8Array(
      await readFile(path.resolve(__dirname, "../fixtures/tiff/g4-strips.tif")),
    );
    platform.pathExists.mockResolvedValue(true);
    platform.readFileBytes.mockResolvedValue(fixture);
    platform.sha256Hex.mockResolvedValue(SHA);
    const result = await materializeProjectDerivedCaches(projectWith(document), PROJECT, null);
    expect(result.written).toBe(0);
    expect(result.keptEmbedded).toBe(1);
    expect(document.embeddedPdf).toBe("JVBERi0xLjQK");
    expect(document.derivedPdf).toBeUndefined();
    expect(writer.writeDerivedCache).not.toHaveBeenCalled();
  });

  it("writes no cache without a usable key", async () => {
    const document = scanDocument({ sha256: "abc" });
    expect(await storeDerivedPdfCache(document, PROJECT, new Uint8Array([1]))).toBe(false);
    expect(writer.writeDerivedCache).not.toHaveBeenCalled();
  });

  it("saves embedded scans as caches and keeps them when the scan is gone", async () => {
    const embeddable = scanDocument();
    const fixture = new Uint8Array(
      await readFile(path.resolve(__dirname, "../fixtures/tiff/rgb8-deflate.tif")),
    );
    const orphan = scanDocument({
      id: "doc_tif_2",
      path: "/gone/Other.tif",
      sha256: "f".repeat(64),
    });
    platform.pathExists.mockImplementation(async (candidate: string) => candidate === SCAN);
    platform.readFileBytes.mockImplementation(async (candidate: string) => {
      if (candidate === SCAN) return fixture;
      throw new Error("missing");
    });
    platform.sha256Hex.mockResolvedValue(SHA);
    platform.fileSize.mockResolvedValue(4096);
    writer.writeDerivedCache.mockResolvedValue(writeInfo("Level 01.derived/fresh.pdf"));

    const result = await materializeProjectDerivedCaches(
      projectWith(embeddable, orphan),
      PROJECT,
      null,
    );
    expect(result.written).toBe(1);
    expect(result.keptEmbedded).toBe(1);
    expect(result.cacheBytes).toBe(4096);
    expect(embeddable.derivedPdf?.relativePath).toBe("Level 01.derived/fresh.pdf");
    expect(embeddable.embeddedPdf).toBeUndefined();
    expect(orphan.embeddedPdf).toBe("JVBERi0xLjQK");
    expect(orphan.derivedPdf).toBeUndefined();
  });

  it("counts a shared cache file once", async () => {
    const first = markerDocument();
    const second = markerDocument();
    second.id = "doc_tif_2";
    platform.fileSize.mockResolvedValue(1024);
    expect(await derivedCacheBytes(projectWith(first, second), PROJECT)).toBe(1024);
  });
});
