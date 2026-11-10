import { describe, expect, it } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef } from "../src/model/types";
import {
  checksumMatches,
  consolidateCandidates,
  detectSourceLocation,
  detachManagedCopy,
  documentSourceKey,
  documentStorage,
  isManagedDocument,
  pageCountChanged,
  relinkSearchFolders,
  sourceChangeActions,
  shouldRecommendManagedCopy,
  applyManagedCopy,
} from "../src/features/sourceStorage";

function managedDocument(): DocumentRef {
  return {
    ...defaultDocument("Plan.pdf", 2),
    storage: "managed",
    path: "/home/ana/Level 01.drawings/Plan-1234abcd.pdf",
    relativePath: "Level 01.drawings/Plan-1234abcd.pdf",
    sha256: "a".repeat(64),
    sizeBytes: 1200,
    originalPath: "/home/ana/OneDrive/Plan.pdf",
    originalSha256: "b".repeat(64),
  };
}

describe("sourceStorage mode", () => {
  it("treats a missing mode as reference and an explicit mode as authoritative", () => {
    expect(documentStorage(defaultDocument("Plan.pdf"))).toBe("reference");
    expect(documentStorage(managedDocument())).toBe("managed");
    expect(isManagedDocument(managedDocument())).toBe(true);
    expect(isManagedDocument(defaultDocument("Plan.pdf"))).toBe(false);
  });

  it("detects UNC and cloud-client locations as a recommendation, not a rule", () => {
    const unc = detectSourceLocation("\\\\fileserver\\projects\\Plan.pdf");
    expect(unc).toEqual({ kind: "network", reason: "unc" });
    expect(shouldRecommendManagedCopy(unc)).toBe(true);

    const cloud = detectSourceLocation(
      "C:\\Users\\ana\\OneDrive - Contoso\\Drawings\\Level 01.pdf",
    );
    expect(cloud).toEqual({ kind: "cloud", reason: "cloud" });
    expect(shouldRecommendManagedCopy(cloud)).toBe(true);

    const local = detectSourceLocation("/home/ana/drawings/Level 01.pdf");
    expect(local).toEqual({ kind: "local", reason: null });
    expect(shouldRecommendManagedCopy(local)).toBe(false);
  });

  it("uses the file path, not the display name, for the source identity", () => {
    const first = managedDocument();
    const second = { ...managedDocument(), id: "doc_duplicate", name: "Duplicate.pdf" };
    expect(documentSourceKey(first)).toBe(documentSourceKey(second));
    expect(documentSourceKey(defaultDocument("A.pdf"))).not.toBe(
      documentSourceKey(defaultDocument("B.pdf")),
    );
  });

  it("rewrites a document to a managed copy and can detach provenance", () => {
    const document = defaultDocument("Plan.pdf", 2);
    document.path = "/home/ana/OneDrive/Plan.pdf";
    document.sha256 = "a".repeat(64);
    document.sizeBytes = 1200;
    applyManagedCopy(
      document,
      {
        destinationPath: "/home/ana/Level 01.drawings/Plan-aaaaaaaa.pdf",
        relativePath: "Level 01.drawings/Plan-aaaaaaaa.pdf",
        sha256: "a".repeat(64),
        sizeBytes: 1200,
      },
      { path: document.path, sha256: document.sha256 },
    );
    expect(document.storage).toBe("managed");
    expect(document.path).toBe("/home/ana/Level 01.drawings/Plan-aaaaaaaa.pdf");
    expect(document.originalPath).toBe("/home/ana/OneDrive/Plan.pdf");
    expect(document.originalSha256).toBe("a".repeat(64));
    detachManagedCopy(document);
    expect(document.storage).toBe("managed");
    expect(document.originalPath).toBeNull();
    expect(document.originalSha256).toBeUndefined();
  });

  it("lists only reference PDFs for consolidation", () => {
    const project = createProject(defaultDocument("Reference.pdf", 1));
    const reference = project.documents[0];
    reference.path = "/tmp/Reference.pdf";
    const managed: DocumentRef = {
      ...managedDocument(),
      id: "doc_managed",
    };
    const scan: DocumentRef = {
      ...defaultDocument("Scan.tif", 1),
      id: "doc_tif",
      kind: "tiff",
      embeddedPdf: "JVBERi0xLjQK",
      path: "/tmp/Scan.tif",
    };
    const duplicate: DocumentRef = {
      ...defaultDocument("Plan copy.pdf", 1),
      id: "doc_duplicate_reference",
      path: reference.path,
    };
    project.documents.push(managed, scan, duplicate);
    const candidates = consolidateCandidates(project, (document) => document.path);
    expect(candidates.map((candidate) => candidate.documentId)).toEqual([reference.id]);
    expect(candidates[0].documentIds).toEqual([reference.id, duplicate.id]);
  });

  it("offers no copy action for an already managed document", () => {
    expect(sourceChangeActions(managedDocument())).toEqual(["reload", "useCurrent", "relink"]);
    expect(sourceChangeActions(defaultDocument("Plan.pdf"))).toEqual([
      "reload",
      "useCurrent",
      "relink",
      "copyIntoProject",
    ]);
  });

  it("searches only the project folder and its drawings folder", () => {
    expect(relinkSearchFolders("/home/ana/Level 01.gridscalr")).toEqual([
      "/home/ana",
      "/home/ana/Level 01.drawings",
    ]);
    expect(relinkSearchFolders("C:\\Work\\Level 01.gridscalr")).toEqual([
      "C:/Work",
      "C:\\Work\\Level 01.drawings",
    ]);
    expect(relinkSearchFolders(null)).toEqual([]);
  });

  it("compares checksums and page counts case-insensitively", () => {
    expect(checksumMatches("A".repeat(64), "a".repeat(64))).toBe(true);
    expect(checksumMatches("", "a".repeat(64))).toBe(false);
    expect(pageCountChanged(3, 4)).toBe(true);
    expect(pageCountChanged(3, 3)).toBe(false);
    expect(pageCountChanged(0, 4)).toBe(false);
  });
});
