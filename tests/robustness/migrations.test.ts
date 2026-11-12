import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProjectWithReport, serializeProject } from "../../src/io/projectFile";
import { validateProject } from "../../src/model/integrity";
import type { Project } from "../../src/model/types";
import { SCHEMA_VERSION } from "../../src/model/types";

/** Committed fixtures, one per supported schema; 23/24 keep the older files too. */
const FIXTURES: ReadonlyArray<{ version: number; file: string }> = [
  ...Array.from({ length: 22 }, (_, index) => ({
    version: index + 1,
    file: `schema-${index + 1}.gridscalr`,
  })),
  { version: 23, file: "schema-23-full.gridscalr" },
  { version: 24, file: "schema-24-full.gridscalr" },
  { version: 25, file: "schema-25.gridscalr" },
  { version: 26, file: "schema-26.gridscalr" },
];

function fixtureText(file: string): string {
  return readFileSync(new URL(`../../fixtures/legacy/${file}`, import.meta.url), "utf8");
}

function fixtureValue(file: string): Record<string, unknown> {
  return JSON.parse(fixtureText(file)) as Record<string, unknown>;
}

function findItem(project: Project, id: string) {
  for (const layer of project.layers) {
    const item = layer.items.find((entry) => entry.id === id);
    if (item) return item;
  }
  return undefined;
}

function measurementItems(project: Project) {
  return project.layers.filter((layer) => layer.kind === "measure").flatMap((layer) => layer.items);
}

function drawItems(project: Project) {
  return project.layers.filter((layer) => layer.kind === "draw").flatMap((layer) => layer.items);
}

function errorCodes(project: Project): string[] {
  return validateProject(project)
    .filter((entry) => entry.severity === "error")
    .map((entry) => entry.code);
}

/** Version-specific data that the migration must preserve, not just relabel. */
function expectIntroducedFields(version: number, project: Project): void {
  if (version >= 2) {
    const text = findItem(project, "item_text")!;
    expect(text.visible).toBe(false);
    expect(text.locked).toBe(true);
  }
  if (version >= 3) {
    expect(project.categories.map((category) => category.name)).toContain("Floor");
    expect(measurementItems(project).some((item) => item.kind === "count")).toBe(true);
    expect(measurementItems(project).some((item) => item.kind === "area")).toBe(true);
  }
  if (version >= 4) {
    expect(project.pages[1]?.state.scaleLocked).toBe(true);
    expect(measurementItems(project).find((item) => item.kind === "area")?.areaShape).toBe(
      "rectangle",
    );
  }
  if (version >= 5) {
    expect(Object.keys(project.assets)).toContain("asset_logo");
    expect(drawItems(project).some((item) => item.kind === "image")).toBe(true);
  }
  if (version >= 6) {
    expect(project.documents.map((document) => document.kind)).toContain("tiff");
    expect(project.documents.find((document) => document.kind === "tiff")?.embeddedPdf).toBe(
      "JVBERi0xLjQK",
    );
  }
  if (version >= 7) {
    expect(project.documents[0].excludedPages).toEqual([3]);
  }
  if (version >= 8) {
    expect(project.settings.stampPresets).toContain("APPROVED");
    expect(drawItems(project).some((item) => item.kind === "callout")).toBe(true);
    expect(drawItems(project).some((item) => item.kind === "stamp")).toBe(true);
  }
  if (version >= 9) {
    const length = findItem(project, "item_measure")!;
    expect(length.lineStyle).toBe("dashed");
    expect(length.labelOffset).toEqual({ x: 5, y: -5 });
    expect(length.labelAnchor).toEqual({ x: 10, y: 0 });
  }
  if (version >= 10) expect(project.settings.smartLengthUnits).toBe(true);
  if (version >= 11) {
    expect(project.layers[0].homePageId).toBe(project.pages[0].id);
    expect(project.layers[0].pageState).toEqual({
      [project.pages[1].id]: { visible: false },
    });
    expect(project.documents.find((document) => document.kind === "tiff")?.copiedFrom).toEqual({
      documentId: "doc_main",
      page: 1,
    });
  }
  if (version >= 12) {
    expect(project.pages[0].state.name).toBe("Ground floor");
    expect(project.pages[0].state.building).toBe("House A");
    expect(project.pages[1].state.floor).toBe("Floor 2");
    expect(project.markupsViews).toHaveLength(1);
  }
  if (version >= 13) {
    const symbol = findItem(project, "item_symbol")!;
    expect(symbol.symbolId).toBe("fire.extinguisher");
    expect(symbol.status).toBe("approved");
  }
  if (version >= 14) expect(findItem(project, "item_symbol")?.symbolSize).toBe(32);
  if (version >= 15) {
    expect(project.settings.labelSize).toBe(7);
    expect(findItem(project, "item_measure")?.labelSize).toBe(8);
  }
  if (version >= 16) expect(findItem(project, "item_area")?.labelFit).toBe("center");
  if (version >= 17) {
    expect(project.pages[0].state.ocr?.text).toBe("Legacy OCR text");
    expect(project.pages[0].state.ocr?.documentSha256).toBe("a".repeat(64));
  }
  if (version >= 18) {
    const kinds = measurementItems(project).map((item) => item.kind);
    expect(kinds).toEqual(expect.arrayContaining(["radius", "diameter", "arc"]));
  }
  if (version >= 19) {
    const kinds = measurementItems(project).map((item) => item.kind);
    expect(kinds).toEqual(expect.arrayContaining(["angle", "slope", "volume"]));
    expect(findItem(project, "item_volume")?.depth).toBe(2.5);
  }
  if (version >= 20) {
    expect(project.countTypes.map((type) => type.id)).toContain("valve");
    expect(findItem(project, "item_count")?.countQuantity).toBe(3);
  }
  if (version >= 21) {
    expect(project.countPresets.map((preset) => preset.countType)).toContain("valve");
    expect(project.markupsViews[0].countType).toBe("valve");
  }
  if (version >= 22) {
    expect(project.metadata.facility).toBe("Legacy facility");
    expect(project.reportLogoAssetId).toBe("asset_logo");
  }
  if (version >= 23) {
    expect(project.lineTypes.map((lineType) => lineType.id)).toContain("line_supply");
    expect(project.documents.some((document) => document.kind === "template")).toBe(true);
    expect(drawItems(project).some((item) => item.kind === "polyline")).toBe(true);
    expect(drawItems(project).some((item) => item.kind === "rail")).toBe(true);
    expect(findItem(project, "item_symbol")?.tag).toBe("FE-01");
  }
  if (version >= 25) {
    expect(project.documents[0].storage).toBe("managed");
    expect(project.documents[0].originalPath).toContain("Legacy plan.pdf");
    expect(project.pages[0].provenance?.sourceProjectId).toBe("prj_source");
  }
  if (version >= 26) {
    const group = project.layers.find((layer) => layer.id === "layer_group")!;
    const child = project.layers.find((layer) => layer.id === "layer_measure")!;
    expect(group.parentId).toBeUndefined();
    expect(child.parentId).toBe("layer_group");
    expect(group.pageState).toEqual({ [project.pages[1].id]: { locked: true } });
  } else {
    // A pre-26 file has no hierarchy field at all.
    expect(project.layers.every((layer) => layer.parentId === undefined)).toBe(true);
  }
}

describe("migration corpus", () => {
  it("has a committed fixture for every supported schema version", () => {
    expect(FIXTURES.map((entry) => entry.version)).toEqual(
      Array.from({ length: SCHEMA_VERSION }, (_, index) => index + 1),
    );
    expect(SCHEMA_VERSION).toBe(26);
  });

  for (const { version, file } of FIXTURES) {
    it(`migrates the schema ${version} fixture and preserves its data`, () => {
      const { project, report } = parseProjectWithReport(fixtureText(file));
      expect(report.migratedFrom).toBe(version);
      expect(project.schemaVersion).toBe(SCHEMA_VERSION);
      expect(project.documents.length).toBeGreaterThanOrEqual(1);
      expect(project.pages.length).toBeGreaterThanOrEqual(1);
      expect(measurementItems(project).length).toBeGreaterThanOrEqual(1);
      expect(project.documents[0].name).toBe("Legacy plan.pdf");
      expect(project.pages[0].documentId).toBe(project.documents[0].id);
      expect(project.pages[0].localPage).toBe(1);
      expect(project.pages[0].state.calibration?.source).toBe("reference");
      expect(findItem(project, "item_measure")?.kind).toBe("length");
      expect(findItem(project, "item_measure")?.points).toEqual([
        { x: 100, y: 100 },
        { x: 220, y: 100 },
      ]);
      expect(errorCodes(project)).toEqual([]);
      expectIntroducedFields(version, project);
    });

    it(`migrates the schema ${version} fixture deterministically`, () => {
      const first = parseProjectWithReport(fixtureText(file)).project;
      const second = parseProjectWithReport(fixtureText(file)).project;
      expect(second.pages.map((page) => page.id)).toEqual(first.pages.map((page) => page.id));
      expect(second.pages.map((page) => page.state)).toEqual(first.pages.map((page) => page.state));
      expect(
        second.layers.flatMap((layer) => layer.items.map((item) => [item.id, item.pageId])),
      ).toEqual(first.layers.flatMap((layer) => layer.items.map((item) => [item.id, item.pageId])));
      expect(second.layers.map((layer) => [layer.id, layer.parentId])).toEqual(
        first.layers.map((layer) => [layer.id, layer.parentId]),
      );

      // A serialized current-schema project keeps the same page identity.
      const roundTrip = parseProjectWithReport(serializeProject(first)).project;
      expect(roundTrip.pages.map((page) => page.id)).toEqual(first.pages.map((page) => page.id));
      expect(roundTrip.layers.map((layer) => [layer.id, layer.parentId])).toEqual(
        first.layers.map((layer) => [layer.id, layer.parentId]),
      );
    });
  }

  it("still loads the original schema 23 and 24 fixtures", () => {
    for (const file of ["schema-23.gridscalr", "schema-24.gridscalr"]) {
      const { project, report } = parseProjectWithReport(fixtureText(file));
      expect(project.schemaVersion).toBe(SCHEMA_VERSION);
      expect(report.migratedFrom).toBe(file.includes("23") ? 23 : 24);
      expect(project.pages.length).toBeGreaterThanOrEqual(1);
      expect(project.layers.flatMap((layer) => layer.items).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("reports invalid page references in every fixture instead of dropping them", () => {
    for (const { version, file } of FIXTURES) {
      const raw = fixtureValue(file);
      const layers = raw.layers as Array<Record<string, unknown>>;
      const measure = layers.find(
        (layer) => layer.kind === "measure" && Array.isArray(layer.items) && layer.items.length,
      )!;
      const items = measure.items as Array<Record<string, unknown>>;
      items[0][version >= 24 ? "pageId" : "page"] = "page_missing";
      measure[version >= 24 ? "homePageId" : "homePage"] = "page_missing";
      measure.pageState = { page_missing: { visible: false } };
      if (version < 24) {
        const pages = raw.pages as Record<string, unknown>;
        pages["999"] = { name: "Outside the page list" };
      }

      const { project, report } = parseProjectWithReport(JSON.stringify(raw));
      expect(report.warnings).toEqual(
        expect.arrayContaining([
          "projectFile.migrationInvalidItemPage",
          "projectFile.migrationInvalidLayerHome",
          "projectFile.migrationInvalidLayerPageState",
        ]),
      );
      if (version < 24) {
        expect(report.warnings).toContain("projectFile.migrationInvalidPageState");
      }
      // The item and the page list survive; only the invalid reference is
      // reported, and it lands on a valid page instead of being silently lost.
      expect(project.pages.length).toBeGreaterThanOrEqual(1);
      const migrated = findItem(project, "item_measure")!;
      expect(migrated).toBeDefined();
      expect(project.pages.some((page) => page.id === migrated.pageId)).toBe(true);
      expect(errorCodes(project)).toEqual([]);
    }
  });

  it("does not move source files during the schema 24 to 25 migration", () => {
    const { project, report } = parseProjectWithReport(fixtureText("schema-24-full.gridscalr"));
    expect(report.migratedFrom).toBe(24);
    for (const document of project.documents) {
      expect(document.storage).toBe("reference");
      expect(document.originalPath).toBeUndefined();
      expect(document.originalSha256).toBeUndefined();
    }
    expect(project.documents[0].path).toBe("/legacy/schema-24/Legacy plan.pdf");
    expect(project.documents[0].relativePath).toBe("Legacy plan.pdf");
    expect(project.documents[1].path).toBe("/legacy/schema-24/Legacy scan.tif");
    expect(project.documents[1].relativePath).toBe("Legacy scan.tif");
  });
});
