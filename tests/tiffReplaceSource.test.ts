import { describe, expect, it } from "vitest";
import {
  applySourceReplacement,
  pageSizeChanged,
  pagesForDocument,
  replacementWarnings,
} from "../src/features/pageModel";
import { createTiffDocumentRef, tiffToPdf } from "../src/io/tiffImport";
import { parseProject } from "../src/io/projectFile";
import { serializeProject } from "../src/io/projectFile/serialize";
import { sha256Hex } from "../src/io/platform";
import { createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef, MarkupItem, Project } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

/** Minimal little-endian TIFF with one IFD per page, enough for tiffToPdf. */
function syntheticTiff(pages: { width: number; height: number }[]): Uint8Array {
  const entryCounts = pages.map(() => 9);
  const ifdOffsets: number[] = [];
  let cursor = 8;
  for (const count of entryCounts) {
    ifdOffsets.push(cursor);
    cursor += 2 + count * 12 + 4;
  }
  const stripBase = cursor;
  const bytes = new Uint8Array(stripBase + pages.length);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  pages.forEach((page, index) => {
    const ifdOffset = ifdOffsets[index];
    const count = entryCounts[index];
    view.setUint16(ifdOffset, count, true);
    let entry = ifdOffset + 2;
    const write = (tag: number, type: number, value: number) => {
      view.setUint16(entry, tag, true);
      view.setUint16(entry + 2, type, true);
      view.setUint32(entry + 4, 1, true);
      if (type === 3) view.setUint16(entry + 8, value, true);
      else view.setUint32(entry + 8, value, true);
      entry += 12;
    };
    write(254, 4, 0);
    write(256, 3, page.width);
    write(257, 3, page.height);
    write(258, 3, 1);
    write(259, 3, 4);
    write(262, 3, 0);
    write(273, 4, stripBase + index);
    write(278, 4, page.height);
    write(279, 4, 1);
    const next = ifdOffset + 2 + count * 12;
    view.setUint32(next, index === pages.length - 1 ? 0 : ifdOffsets[index + 1], true);
  });

  return bytes;
}

interface TiffSource {
  bytes: Uint8Array;
  document: DocumentRef;
}

async function tiffSource(
  name: string,
  pages: { width: number; height: number }[],
  id?: string,
): Promise<TiffSource> {
  const bytes = syntheticTiff(pages);
  const conversion = await tiffToPdf(bytes);
  const document = createTiffDocumentRef({
    name,
    path: `/plans/${name}`,
    sha256: await sha256Hex(bytes),
    sizeBytes: bytes.byteLength,
    conversion,
  });
  if (id) document.id = id;
  return { bytes, document };
}

function item(id: string, pageId: string): MarkupItem {
  return {
    id,
    pageId,
    kind: "count",
    points: [{ x: 0, y: 0 }],
    color: "#ffffff",
    strokeWidth: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function baseProject(old: DocumentRef): Project {
  const project = withTestPageIds(createProject(defaultDocument(old.name, old.pageCount)));
  Object.assign(project.documents[0], old, { id: project.documents[0].id });
  const layer = project.layers.find((entry) => entry.kind === "measure")!;
  project.pages.forEach((page, index) => layer.items.push(item(`item_${index + 1}`, page.id)));
  project.pages[0].state.name = "Ground floor";
  return project;
}

function itemPageMap(project: Project): Record<string, string> {
  return Object.fromEntries(
    project.layers.flatMap((layer) => layer.items.map((entry) => [entry.id, entry.pageId])),
  );
}

describe("TIF source replacement", () => {
  it("replaces an identical-page TIF revision in place", async () => {
    const old = await tiffSource("Old scan.tif", [
      { width: 64, height: 48 },
      { width: 128, height: 96 },
    ]);
    const project = baseProject(old.document);
    const documentId = project.documents[0].id;
    const next = await tiffSource(
      "New scan.tif",
      [
        { width: 64, height: 48 },
        { width: 128, height: 96 },
      ],
      "doc_next_tif",
    );
    const items = itemPageMap(project);
    const pageIds = project.pages.map((page) => page.id);

    const result = applySourceReplacement(project, {
      documentId,
      newDocument: next.document,
      mappings: [
        { pageId: pageIdFor(1), newLocalPage: 1 },
        { pageId: pageIdFor(2), newLocalPage: 2 },
      ],
    });

    expect(result).toMatchObject({ updatedDocument: true, mappedPages: 2, supersededPages: 0 });
    expect(project.documents).toHaveLength(1);
    const document = project.documents[0];
    expect(document.kind).toBe("tiff");
    expect(document.name).toBe("New scan.tif");
    expect(document.embeddedPdf).toBe(next.document.embeddedPdf);
    expect(document.sha256).toBe(await sha256Hex(next.bytes));
    expect(document.source?.originalName).toBe("New scan.tif");
    expect(project.pages.map((page) => page.id)).toEqual(pageIds);
    expect(project.pages.map((page) => page.localPage)).toEqual([1, 2]);
    expect(project.pages[0].state.name).toBe("Ground floor");
    expect(itemPageMap(project)).toEqual(items);

    const reloaded = parseProject(serializeProject(project));
    expect(reloaded.documents[0].kind).toBe("tiff");
    expect(reloaded.documents[0].sha256).toBe(document.sha256);
    expect(reloaded.pages.map((page) => page.id)).toEqual(pageIds);
  });

  it("maps a swapped-page TIF revision by page identity", async () => {
    const old = await tiffSource("Survey.tif", [
      { width: 64, height: 48 },
      { width: 128, height: 96 },
    ]);
    const project = baseProject(old.document);
    const documentId = project.documents[0].id;
    const next = await tiffSource(
      "Survey rev B.tif",
      [
        { width: 128, height: 96 },
        { width: 64, height: 48 },
      ],
      "doc_next_tif",
    );
    const items = itemPageMap(project);
    const pageIds = project.pages.map((page) => page.id);

    const result = applySourceReplacement(project, {
      documentId,
      newDocument: next.document,
      mappings: [
        // The sheets swapped positions; the user maps each old page to its new one.
        { pageId: pageIdFor(1), newLocalPage: 2 },
        { pageId: pageIdFor(2), newLocalPage: 1 },
      ],
    });

    expect(result).toMatchObject({ updatedDocument: true, mappedPages: 2 });
    expect(project.documents).toHaveLength(1);
    expect(project.pages.map((page) => page.id)).toEqual(pageIds);
    expect(project.pages.map((page) => page.localPage)).toEqual([2, 1]);
    expect(itemPageMap(project)).toEqual(items);
    expect(pagesForDocument(project, documentId)).toEqual([pageIdFor(1), pageIdFor(2)]);
  });

  it("keeps unmatched TIF pages on a superseded source until cleanup", async () => {
    const old = await tiffSource("Three sheets.tif", [
      { width: 64, height: 48 },
      { width: 128, height: 96 },
      { width: 96, height: 72 },
    ]);
    const project = baseProject(old.document);
    const documentId = project.documents[0].id;
    const next = await tiffSource(
      "Three sheets rev B.tif",
      [
        { width: 64, height: 48 },
        { width: 128, height: 96 },
      ],
      "doc_next_tif",
    );
    const items = itemPageMap(project);

    const result = applySourceReplacement(project, {
      documentId,
      newDocument: next.document,
      mappings: [{ pageId: pageIdFor(1), newLocalPage: 1 }],
    });

    expect(result).toMatchObject({ updatedDocument: false, mappedPages: 1, supersededPages: 2 });
    expect(project.documents).toHaveLength(2);
    expect(project.documents.find((entry) => entry.id === documentId)?.superseded).toBe(true);
    expect(project.pages).toHaveLength(3);
    expect(project.pages[0].documentId).toBe("doc_next_tif");
    expect(project.pages[1].documentId).toBe(documentId);
    expect(project.pages[2].documentId).toBe(documentId);
    expect(itemPageMap(project)).toEqual(items);
    expect(pagesForDocument(project, documentId)).toEqual([pageIdFor(2), pageIdFor(3)]);
  });

  it("leaves the picked source bytes unchanged", async () => {
    const old = await tiffSource("Immutable.tif", [{ width: 64, height: 48 }]);
    const project = baseProject(old.document);
    const next = await tiffSource(
      "Immutable rev B.tif",
      [{ width: 64, height: 48 }],
      "doc_next_tif",
    );
    const beforeOld = old.bytes.slice();
    const beforeNext = next.bytes.slice();

    applySourceReplacement(project, {
      documentId: project.documents[0].id,
      newDocument: next.document,
      mappings: [{ pageId: pageIdFor(1), newLocalPage: 1 }],
    });

    expect(next.bytes).toEqual(beforeNext);
    expect(old.bytes).toEqual(beforeOld);
  });

  it("warns about a page-size change and reports changed viewports", () => {
    expect(pageSizeChanged({ width: 100, height: 100 }, { width: 100.4, height: 100 })).toBe(false);
    expect(pageSizeChanged({ width: 100, height: 100 }, { width: 101, height: 100 })).toBe(true);
    expect(
      replacementWarnings({
        oldPageCount: 2,
        newPageCount: 2,
        calibratedPages: 1,
        scaleLockedPages: 0,
        sizeChangedPages: 2,
      }),
    ).toEqual(["pageSize", "calibration"]);
  });
});
