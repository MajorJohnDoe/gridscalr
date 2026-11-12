import { describe, expect, it } from "vitest";
import { commitProjectImport, prepareProjectImport } from "../src/features/projectImport/model";
import type {
  ImportDocumentOverride,
  ImportSourceMismatch,
} from "../src/features/projectImport/model";
import { buildImportPreflight } from "../src/features/projectImport/preflight";
import type { PreflightSourceWarning } from "../src/features/projectImport/preflight";
import {
  buildImportSourceStates,
  emptyPreparedImport,
  sourceNeedsConfirmation,
  summarizeImportPreflight,
} from "../src/features/projectImport/relink";
import type { ImportPreflightSnapshot } from "../src/features/projectImport/relink";
import { createProject, defaultDocument } from "../src/model/layers";
import type { Layer, MarkupItem, Project } from "../src/model/types";
import { withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

function item(id: string, page: number): MarkupItem {
  return {
    id,
    pageId: `page_${page}`,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    scale: { pointsPerMeter: 20, sourceUnit: "m" },
  };
}

function destinationProject(): Project {
  const document = defaultDocument("Destination.pdf", 1);
  document.sha256 = "hash_destination";
  return withTestPageIds(createProject(document));
}

function sourceProject(): Project {
  const pdf = defaultDocument("Plan.pdf", 3);
  pdf.sha256 = "hash_plan";
  pdf.sizeBytes = 2048;
  const project = withTestPageIds(createProject(pdf));
  project.name = "Source";
  const layer = project.layers.find((entry): entry is Layer => entry.kind === "measure")!;
  layer.items.push(item("src_length", 1));
  return project;
}

function overrides(
  pdf: Project,
  values: ImportDocumentOverride,
): Map<string, ImportDocumentOverride> {
  return new Map([[pdf.documents[0].id, values]]);
}

function snapshot(
  destination: Project,
  source: Project,
  input: {
    pages: number[];
    skipped: number[];
    pageCounts: ReadonlyMap<string, number>;
    mismatches: readonly ImportSourceMismatch[];
  },
): ImportPreflightSnapshot {
  const prepared = input.pages.length
    ? prepareProjectImport(
        destination,
        source,
        input.pages,
        overrides(source, {
          pageCount: Math.max(...input.pages.map((page) => source.pages[page - 1].localPage)),
          path: "/drawings/Plan.pdf",
          sha256: "hash_plan",
          sizeBytes: 2048,
        }),
      )
    : emptyPreparedImport();
  return {
    preflight: buildImportPreflight({
      prepared,
      sourceName: source.name,
      skipped: input.skipped,
      warnings: warningsFor(input.mismatches),
    }),
    sources: buildImportSourceStates({
      source,
      selected: [1, 2, 3],
      skipped: input.skipped,
      pageCounts: input.pageCounts,
      mismatches: input.mismatches,
    }),
  };
}

function warningsFor(mismatches: readonly ImportSourceMismatch[]): PreflightSourceWarning[] {
  const warnings: PreflightSourceWarning[] = [];
  for (const mismatch of mismatches) {
    if (mismatch.checksum) warnings.push({ code: "checksum", documentName: mismatch.name });
    if (mismatch.pageCount) {
      warnings.push({
        code: "pageCount",
        documentName: mismatch.name,
        expected: mismatch.expectedPageCount,
        actual: mismatch.actualPageCount,
      });
    }
  }
  return warnings;
}

describe("import preflight relink state", () => {
  it("shows a missing source, then imports its pages after a relink", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const document = source.documents[0];

    const missing = snapshot(destination, source, {
      pages: [],
      skipped: [1, 2, 3],
      pageCounts: new Map(),
      mismatches: [],
    });
    expect(missing.sources).toHaveLength(1);
    expect(missing.sources[0]).toMatchObject({
      documentId: document.id,
      missing: true,
      importablePages: 0,
      selectedPages: 3,
    });
    expect(summarizeImportPreflight(missing, new Set())).toMatchObject({
      pages: 0,
      missingDocuments: 1,
      blocked: true,
    });

    const relinked = snapshot(destination, source, {
      pages: [1, 2, 3],
      skipped: [],
      pageCounts: new Map([[document.id, 3]]),
      mismatches: [],
    });
    expect(relinked.sources[0]).toMatchObject({
      missing: false,
      importablePages: 3,
      actualPageCount: 3,
    });
    const summary = summarizeImportPreflight(relinked, new Set());
    expect(summary).toMatchObject({ pages: 3, blocked: false, missingDocuments: 0 });

    const before = JSON.stringify(destination);
    const prepared = prepareProjectImport(
      destination,
      source,
      relinked.preflight.pages === 3 ? [1, 2, 3] : [],
      overrides(source, {
        pageCount: 3,
        path: "/drawings/Plan.pdf",
        sha256: "hash_plan",
        sizeBytes: 2048,
      }),
    );
    expect(JSON.stringify(destination)).toBe(before);
    commitProjectImport(destination, prepared);

    expect(destination.documents).toHaveLength(2);
    expect(destination.pages).toHaveLength(4);
    const importedItems = destination.layers
      .flatMap((layer) => layer.items)
      .filter((entry) => entry.kind === "length" && entry.pageId === destination.pages[1].id);
    expect(importedItems).toHaveLength(1);
  });

  it("blocks a changed checksum until it is explicitly accepted", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const document = source.documents[0];
    const changed = snapshot(destination, source, {
      pages: [1, 2, 3],
      skipped: [],
      pageCounts: new Map([[document.id, 3]]),
      mismatches: [
        {
          documentId: document.id,
          name: document.name,
          checksum: true,
          pageCount: false,
          expectedPageCount: 3,
          actualPageCount: 3,
        },
      ],
    });

    expect(changed.sources[0].checksumChanged).toBe(true);
    expect(sourceNeedsConfirmation(changed.sources[0])).toBe(true);
    const unconfirmed = summarizeImportPreflight(changed, new Set());
    expect(unconfirmed.blocked).toBe(true);
    expect(unconfirmed.unconfirmedDocuments).toBe(1);
    expect(summarizeImportPreflight(changed, new Set([document.id]))).toMatchObject({
      blocked: false,
      unconfirmedDocuments: 0,
    });
  });

  it("reports a shorter replacement file and blocks until it is accepted", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const document = source.documents[0];
    const changed = snapshot(destination, source, {
      pages: [1, 2],
      skipped: [3],
      pageCounts: new Map([[document.id, 2]]),
      mismatches: [
        {
          documentId: document.id,
          name: document.name,
          checksum: false,
          pageCount: true,
          expectedPageCount: 3,
          actualPageCount: 2,
        },
      ],
    });

    expect(changed.sources[0]).toMatchObject({
      missing: false,
      actualPageCount: 2,
      importablePages: 2,
      pageCountChanged: true,
    });
    expect(changed.preflight.pageCountChanges).toEqual([
      { name: document.name, expected: 3, actual: 2 },
    ]);
    expect(summarizeImportPreflight(changed, new Set()).blocked).toBe(true);
    expect(summarizeImportPreflight(changed, new Set([document.id])).blocked).toBe(false);
  });

  it("leaves both projects untouched until the commit runs", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const destinationBefore = JSON.stringify(destination);
    const sourceBefore = JSON.stringify(source);

    const missing = snapshot(destination, source, {
      pages: [],
      skipped: [1, 2, 3],
      pageCounts: new Map(),
      mismatches: [],
    });
    const relinked = snapshot(destination, source, {
      pages: [1, 2, 3],
      skipped: [],
      pageCounts: new Map([[source.documents[0].id, 3]]),
      mismatches: [],
    });
    // Cancelling after any number of relinks drops the prepared import.
    expect([missing.preflight.pages, relinked.preflight.pages]).toEqual([0, 3]);
    expect(JSON.stringify(destination)).toBe(destinationBefore);
    expect(JSON.stringify(source)).toBe(sourceBefore);
  });
});
