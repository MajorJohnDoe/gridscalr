import { describe, expect, it } from "vitest";
import { serializeProject } from "../src/io/projectFile";
import { createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef, Project } from "../src/model/types";
import { tiffToPdf } from "../src/io/tiffImport";

/*
 * The measured before/after for the derived-PDF cache (ADR 0015, issue #256).
 *
 * A project that keeps a colour scan's derived PDF in `embeddedPdf` rewrites
 * those base64 bytes on every save, autosave, undo snapshot and recovery record.
 * With the schema 27 cache the same bytes live once, beside the project, and the
 * JSON carries only a marker.
 *
 * The default run stays fast in the normal suite. Set
 * `GRIDSCALR_DERIVED_BENCH=1` to build the documented reference measurement
 * (six A2-class colour sheets at 300 DPI) and print the numbers recorded in
 * `docs/limitations.md`.
 */

/** A minimal uncompressed RGB TIFF: one strip, 300 DPI, little-endian. */
function writeRgbTiff(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const stripBytes = width * height * 3;
  const ifdOffset = 8;
  const tagCount = 11;
  const ifdSize = 2 + tagCount * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize;
  const xResolutionOffset = bitsOffset + 6;
  const yResolutionOffset = xResolutionOffset + 8;
  const pixelOffset = yResolutionOffset + 8;
  const total = pixelOffset + stripBytes;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, tagCount, true);

  let entry = ifdOffset + 2;
  const tag = (id: number, type: number, count: number, value: number) => {
    view.setUint16(entry, id, true);
    view.setUint16(entry + 2, type, true);
    view.setUint32(entry + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(entry + 8, value, true);
    else view.setUint32(entry + 8, value, true);
    entry += 12;
  };
  const SHORT = 3;
  const LONG = 4;
  const RATIONAL = 5;
  tag(256, LONG, 1, width);
  tag(257, LONG, 1, height);
  tag(258, SHORT, 3, bitsOffset);
  tag(259, SHORT, 1, 1);
  tag(262, SHORT, 1, 2);
  tag(273, LONG, 1, pixelOffset);
  tag(277, SHORT, 1, 3);
  tag(278, LONG, 1, height);
  tag(279, LONG, 1, stripBytes);
  tag(282, RATIONAL, 1, xResolutionOffset);
  tag(283, RATIONAL, 1, yResolutionOffset);
  view.setUint32(entry, 0, true);

  view.setUint16(bitsOffset, 8, true);
  view.setUint16(bitsOffset + 2, 8, true);
  view.setUint16(bitsOffset + 4, 8, true);
  for (const offset of [xResolutionOffset, yResolutionOffset]) {
    view.setUint32(offset, 300, true);
    view.setUint32(offset + 4, 1, true);
  }
  bytes.set(pixels, pixelOffset);
  return bytes;
}

/** Deterministic line-art sheet with scan grain: compresses like a real plan. */
function lineArtSheet(width: number, height: number, seed: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 3);
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const grain = Math.round((random() - 0.5) * 6);
      const border = x < 24 || y < 24 || x >= width - 24 || y >= height - 24;
      const grid = x % 120 === 0 || y % 120 === 0;
      const hatch = (x + y) % 240 === 0;
      const base = border || grid || hatch ? 40 : 250;
      const level = Math.max(0, Math.min(255, base + grain));
      const index = (y * width + x) * 3;
      pixels[index] = level;
      pixels[index + 1] = level;
      pixels[index + 2] = level;
    }
  }
  return pixels;
}

function projectJson(documents: DocumentRef[]): string {
  const project = createProject(defaultDocument("Plan.pdf", 1)) as Project;
  project.name = "Derived cache reference";
  project.documents = documents;
  return serializeProject(project);
}

const referenceRun = process.env.GRIDSCALR_DERIVED_BENCH === "1";

describe("derived-PDF cache budget measurement (ADR 0015)", () => {
  it(
    "moves the derived raster out of the project JSON",
    async () => {
      const reference = referenceRun;
      const width = reference ? 4960 : 320;
      const height = reference ? 3508 : 240;
      const sheets = reference ? 6 : 2;

      const embedded: DocumentRef[] = [];
      const cached: DocumentRef[] = [];
      let derivedBytes = 0;
      for (let index = 0; index < sheets; index += 1) {
        const tif = writeRgbTiff(width, height, lineArtSheet(width, height, 17 + index));
        const conversion = await tiffToPdf(tif);
        derivedBytes += conversion.bytes.byteLength;
        const document = defaultDocument(`Sheet ${index + 1}.tif`, 1);
        document.kind = "tiff";
        document.path = `/scans/Sheet ${index + 1}.tif`;
        document.sha256 = String(index + 1).repeat(64);
        document.sizeBytes = tif.byteLength;
        document.embeddedPdf = Buffer.from(conversion.bytes).toString("base64");
        document.source = { format: "tiff", dpi: [300, 300], originalName: document.name };
        embedded.push(document);
        cached.push({
          ...document,
          embeddedPdf: undefined,
          derivedPdf: {
            sourceSha256: document.sha256,
            converterVersion: 1,
            pageCount: 1,
            relativePath: `Derived cache reference.derived/${index}.pdf`,
          },
        });
      }

      const beforeJson = projectJson(embedded);
      const afterJson = projectJson(cached);
      const before = new TextEncoder().encode(beforeJson).byteLength;
      const after = new TextEncoder().encode(afterJson).byteLength;
      const megabytes = (value: number) => Number((value / (1024 * 1024)).toFixed(2));
      console.log(
        `[derived-cache] ${sheets} sheet(s) at ${width}x${height}: embedded ${megabytes(before)} MiB JSON, ` +
          `cached ${megabytes(after)} MiB JSON, ${megabytes(derivedBytes)} MiB cache on disk`,
      );

      expect(before).toBeGreaterThan(derivedBytes);
      expect(after).toBeLessThan(64 * 1024);
      expect(before / after).toBeGreaterThan(10);
      const stored = JSON.parse(afterJson).documents as DocumentRef[];
      expect(stored.every((document) => !document.embeddedPdf)).toBe(true);
      expect(stored.every((document) => Boolean(document.derivedPdf))).toBe(true);
    },
    referenceRun ? 120_000 : 20_000,
  );
});
