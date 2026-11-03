// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDiagnostics,
  projectStats,
  sanitizeDiagnosticText,
} from "../src/features/diagnostics/model";
import {
  clearDiagnosticsLog,
  LOG_LIMIT,
  logEvent,
  readDiagnosticsLog,
} from "../src/features/diagnostics/log";
import type { Project } from "../src/model/types";

function project(): Project {
  return {
    schemaVersion: 21,
    id: "project_1",
    name: "Secret Northgate Takeoff",
    documents: [
      {
        id: "doc_1",
        kind: "pdf",
        name: "Secret Bottenplan.pdf",
        path: "/home/anna/Secret/Bottenplan.pdf",
        relativePath: "Secret/Bottenplan.pdf",
        sha256: "abc",
        pageCount: 4,
        sizeBytes: 1234,
      },
    ],
    settings: {},
    categories: [{ id: "cat_1", name: "Secret category", color: "#fff", waste: 0, rounding: 0 }],
    countTypes: [{ id: "other", label: "Other", glyph: "count" }],
    countPresets: [],
    assets: {
      asset_1: {
        id: "asset_1",
        name: "Secret image.png",
        mime: "image/png",
        width: 10,
        height: 10,
        byteSize: 2048,
        data: "data:image/png;base64,AAAA",
      },
    },
    pages: {},
    markupsViews: [],
    layers: [
      {
        id: "layer_1",
        name: "Secret measurements",
        kind: "measure",
        visible: true,
        locked: false,
        opacity: 1,
        color: "#f70808",
        items: [
          {
            id: "item_1",
            page: 1,
            kind: "area",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
            ],
            color: "#f70808",
            label: "Secret office 42",
          },
        ],
      },
    ],
    activeLayerId: "layer_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Project;
}

const input = {
  version: "0.16.1",
  schemaVersion: 21,
  platform: "windows",
  desktop: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/126",
  mode: "production",
  locale: "en-GB",
  viewport: { width: 1460, height: 920, dpr: 1 },
  autosaveFailure: "/home/anna/Secret failed to persist",
  log: [
    {
      at: "2026-11-03T18:00:00.000Z",
      level: "warn" as const,
      message: "autosave failed for /home/anna/Secret/Bottenplan.pdf",
    },
  ],
};

describe("sanitizeDiagnosticText", () => {
  it("replaces absolute paths but keeps URLs", () => {
    expect(sanitizeDiagnosticText("/home/anna/Plans/Bottenplan.pdf could not open")).toBe(
      "<path> could not open",
    );
    expect(sanitizeDiagnosticText("C:\\Users\\Anna\\Plans\\plan.gridscalr failed")).toBe(
      "<path> failed",
    );
    expect(sanitizeDiagnosticText("see https://example.com/plans/a for details")).toBe(
      "see https://example.com/plans/a for details",
    );
  });

  it("collapses whitespace and caps the length", () => {
    expect(sanitizeDiagnosticText("  a \n b  ")).toBe("a b");
    expect(sanitizeDiagnosticText("x".repeat(500)).length).toBe(400);
  });
});

describe("projectStats", () => {
  it("counts documents, layers, items and embedded data", () => {
    const stats = projectStats(project());
    expect(stats.documents).toBe(1);
    expect(stats.pages).toBe(4);
    expect(stats.measureLayers).toBe(1);
    expect(stats.drawingLayers).toBe(0);
    expect(stats.items).toBe(1);
    expect(stats.itemsByKind).toEqual([["area", 1]]);
    expect(stats.embeddedBytes).toBe(2048);
  });
});

describe("buildDiagnostics", () => {
  it("describes the session without names, labels or paths", () => {
    const text = buildDiagnostics({ ...input, project: projectStats(project()) });
    expect(text).toContain("GridScalr 0.16.1 · project schema 21");
    expect(text).toContain("Platform: windows · production build");
    expect(text).toContain("area 1");
    expect(text).toContain("Autosave: failing — <path> failed to persist");
    expect(text).not.toContain("Secret");
    expect(text).not.toContain("/home/anna");
    expect(text).not.toContain("42");
  });

  it("reports when no project is open", () => {
    expect(buildDiagnostics({ ...input, project: null, log: [] })).toContain("Project: none open");
  });
});

describe("diagnostics log", () => {
  beforeEach(() => {
    clearDiagnosticsLog();
  });

  it("keeps a bounded ring buffer and sanitises entries", () => {
    for (let index = 0; index < LOG_LIMIT + 5; index += 1) {
      logEvent("error", `failure ${index} at /home/anna/Plans/${index}.pdf`);
    }
    const entries = readDiagnosticsLog();
    expect(entries).toHaveLength(LOG_LIMIT);
    expect(entries[0]?.message).toContain("failure 5");
    expect(entries.at(-1)?.message).toContain("<path>");
    expect(entries.at(-1)?.message).not.toContain("/home/anna");
  });
});
