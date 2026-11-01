import { describe, expect, it } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef, Project } from "../src/model/types";
import {
  DEFAULT_PACKAGE_OPTIONS,
  documentArchivePaths,
  normalizePackageFailure,
  parsePackageManifest,
  portableProjectJson,
  safeArchiveBase,
  sourceScanArchivePaths,
  suggestedPackageFileName,
  suggestedProjectFileName,
  uniqueArchiveName,
  validatePackagedProjectJson,
  validatePackageManifest,
  type PackageManifest,
} from "../src/features/projectPackage/model";

function projectWithDocuments(): Project {
  const project = createProject(defaultDocument("Plan.pdf", 2), createDefaultLayers());
  project.name = "Level 01";
  project.documents[0].path = "/home/ana/drawings/Plan.pdf";
  project.documents[0].relativePath = "../drawings/Plan.pdf";
  project.documents[0].sha256 = "a".repeat(64);
  project.documents[0].sizeBytes = 1200;
  const facade: DocumentRef = {
    ...defaultDocument("Fasad ö.pdf", 1),
    id: "doc_facade",
    path: "C:\\Ritningar\\Fasad ö.pdf",
    relativePath: "../Ritningar/Fasad ö.pdf",
    sha256: "b".repeat(64),
    sizeBytes: 800,
  };
  const scan: DocumentRef = {
    ...defaultDocument("Site plan.tif", 1),
    id: "doc_scan",
    kind: "tiff",
    path: "/home/ana/scans/Site plan.tif",
    relativePath: "../scans/Site plan.tif",
    sha256: "c".repeat(64),
    sizeBytes: 700,
    embeddedPdf: "JVBERi0xLjQK",
  };
  project.documents.push(facade, scan);
  return project;
}

function validManifest(): PackageManifest {
  return {
    format: "gridscalr-package",
    formatVersion: 1,
    createdAt: "2026-11-01T10:00:00.000Z",
    appVersion: "0.16.1",
    projectFile: "Level 01.gridscalr",
    projectSha256: "d".repeat(64),
    projectSchema: 21,
    documents: [
      {
        file: "documents/Plan.pdf",
        sha256: "a".repeat(64),
        sizeBytes: 1200,
        kind: "pdf",
      },
      {
        file: "documents/Fasad ö.pdf",
        sha256: "b".repeat(64),
        sizeBytes: 800,
        kind: "pdf",
      },
    ],
    exports: [],
    sourceScans: [],
  };
}

describe("project package model", () => {
  it("suggests safe package and project file names", () => {
    const project = projectWithDocuments();
    expect(suggestedProjectFileName(project)).toBe("Level 01.gridscalr");
    expect(suggestedPackageFileName(project)).toBe("Level 01.gridscalr.zip");
    expect(safeArchiveBase("A/B: Plan?.pdf")).toBe("B_ Plan_.pdf");
    expect(safeArchiveBase("CON")).toBe("_CON");
    expect(safeArchiveBase("   ")).toBe("Document");
  });

  it("keeps document archive names unique, Unicode-friendly and long-name safe", () => {
    const project = projectWithDocuments();
    project.documents.push(
      { ...defaultDocument("Plan.pdf"), id: "doc_duplicate", path: "/tmp/Plan.pdf" },
      {
        ...defaultDocument(`${"a".repeat(220)}.pdf`),
        id: "doc_long",
        path: "/tmp/Long.pdf",
      },
    );
    const paths = [...documentArchivePaths(project).values()];
    expect(paths[0]).toBe("documents/Plan.pdf");
    expect(paths[1]).toBe("documents/Fasad ö.pdf");
    expect(paths[2]).toBe("documents/Plan-2.pdf");
    expect(paths[3].length).toBeLessThan(240);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("maps only TIF documents to optional source scans", () => {
    const project = projectWithDocuments();
    expect([...sourceScanArchivePaths(project).values()]).toEqual(["source-scans/Site plan.tif"]);
  });

  it("writes a portable project without sender paths and without mutating the project", () => {
    const project = projectWithDocuments();
    const paths = documentArchivePaths(project);
    const json = portableProjectJson(project, paths);
    const copy = JSON.parse(json) as Project;

    expect(copy.documents[0].path).toBeNull();
    expect(copy.documents[0].relativePath).toBe("documents/Plan.pdf");
    expect(copy.documents[1].relativePath).toBe("documents/Fasad ö.pdf");
    expect(copy.documents[2].path).toBeNull();
    expect(copy.documents[2].relativePath).toBeNull();
    expect(copy.documents[2].embeddedPdf).toBe("JVBERi0xLjQK");
    expect(json).not.toContain("/home/ana/");
    expect(json).not.toContain("C:\\\\Ritningar");

    expect(project.documents[0].path).toBe("/home/ana/drawings/Plan.pdf");
    expect(project.documents[1].path).toBe("C:\\Ritningar\\Fasad ö.pdf");
    expect(project.documents[0].sha256).toBe("a".repeat(64));
  });

  it("updates only the packaged copy when a checksum is accepted", () => {
    const project = projectWithDocuments();
    const json = portableProjectJson(project, documentArchivePaths(project), {
      [project.documents[0].id]: { sha256: "f".repeat(64), sizeBytes: 999 },
    });
    const copy = JSON.parse(json) as Project;
    const document = copy.documents.find((entry) => entry.sha256 === "f".repeat(64));
    expect(document?.sizeBytes).toBe(999);
    expect(project.documents[0].sha256).toBe("a".repeat(64));
    expect(project.documents[0].sizeBytes).toBe(1200);
  });

  it("keeps every optional package feature off by default", () => {
    expect(DEFAULT_PACKAGE_OPTIONS).toEqual({
      includeQuantityExports: false,
      includeDrawingPdf: false,
      includeSourceScans: false,
    });
  });

  it("accepts a valid manifest and rejects malformed or unsafe headers", () => {
    const manifest = validManifest();
    expect(validatePackageManifest(manifest)).toEqual(manifest);
    expect(parsePackageManifest(JSON.stringify(manifest)).projectFile).toBe("Level 01.gridscalr");

    expect(() => validatePackageManifest({ ...manifest, format: "other" })).toThrow(
      /not a GridScalr project package/i,
    );
    expect(() => validatePackageManifest({ ...manifest, formatVersion: 2 })).toThrow(
      /unsupported format version/i,
    );
    expect(() =>
      validatePackageManifest({
        ...manifest,
        documents: [{ ...manifest.documents[0], file: "documents/../Plan.pdf" }],
      }),
    ).toThrow(/unsafe file name/i);
    expect(() =>
      validatePackageManifest({
        ...manifest,
        documents: [manifest.documents[0], { ...manifest.documents[0] }],
      }),
    ).toThrow(/more than once/i);
    expect(() =>
      validatePackageManifest({
        ...manifest,
        documents: [{ ...manifest.documents[0], sha256: "not-a-hash" }],
      }),
    ).toThrow(/invalid checksum/i);
    expect(() =>
      validatePackageManifest({ ...manifest, projectFile: "../../Plan.gridscalr" }),
    ).toThrow(/invalid project file/i);
  });

  it("rejects an extracted project that keeps absolute or external document links", () => {
    const valid = JSON.stringify({
      schemaVersion: 21,
      documents: [
        { path: null, relativePath: "documents/Plan.pdf", kind: "pdf" },
        { path: null, relativePath: null, kind: "tiff" },
      ],
    });
    expect(() => validatePackagedProjectJson(valid)).not.toThrow();
    expect(() =>
      validatePackagedProjectJson(
        JSON.stringify({ documents: [{ path: "/home/ana/Plan.pdf", relativePath: null }] }),
      ),
    ).toThrow(/absolute document path/i);
    expect(() =>
      validatePackagedProjectJson(
        JSON.stringify({ documents: [{ path: null, relativePath: "../Plan.pdf" }] }),
      ),
    ).toThrow(/outside documents/i);
  });

  it("normalises structured Rust failures", () => {
    expect(normalizePackageFailure({ kind: "cancelled" })).toEqual({ kind: "cancelled" });
    expect(
      normalizePackageFailure({
        kind: "missingSource",
        files: [{ name: "Plan.pdf", path: "/tmp/Plan.pdf" }],
      }),
    ).toEqual({
      kind: "missingSource",
      files: [{ name: "Plan.pdf", path: "/tmp/Plan.pdf" }],
    });
    expect(normalizePackageFailure(new Error("boom"))).toEqual({
      kind: "unknown",
      message: "boom",
    });
  });

  it("assigns a fresh suffix when a name is already used", () => {
    const used = new Set<string>(["plan.pdf"]);
    expect(uniqueArchiveName("Plan.pdf", ".pdf", used)).toBe("Plan-2.pdf");
    expect(uniqueArchiveName("Plan.pdf", ".pdf", used)).toBe("Plan-3.pdf");
  });
});
