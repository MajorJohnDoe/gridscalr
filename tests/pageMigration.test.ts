import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProject, parseProjectWithReport } from "../src/io/projectFile";
import { pageNumber } from "../src/model/pages";
import { SCHEMA_VERSION } from "../src/model/types";

const fixtureText = readFileSync(
  new URL("../fixtures/legacy/schema-23.gridscalr", import.meta.url),
  "utf8",
);

function fixture(): Record<string, unknown> {
  return JSON.parse(fixtureText) as Record<string, unknown>;
}

describe("schema 23 → 24 page migration", () => {
  it("builds the page list from document order and excluded pages", () => {
    const { project, report } = parseProjectWithReport(fixtureText);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(report.migratedFrom).toBe(23);
    expect(project.pages).toHaveLength(4);
    expect(project.pages.map((page) => [page.documentId, page.localPage])).toEqual([
      ["doc_main", 1],
      ["doc_main", 2],
      ["doc_second", 1],
      ["doc_second", 2],
    ]);
    expect(new Set(project.pages.map((page) => page.id)).size).toBe(4);
  });

  it("moves numeric page state into the matching PageRecord", () => {
    const { project } = parseProjectWithReport(fixtureText);
    expect(project.pages[0].state.name).toBe("Ground floor");
    expect(project.pages[0].state.building).toBe("House A");
    expect(project.pages[0].state.scaleLocked).toBe(true);
    expect(project.pages[0].state.calibration?.source).toBe("manual");
    expect(project.pages[1].state.name).toBe("Upper floor");
    expect(project.pages[2].state.name).toBeUndefined();
    expect(project.pages[3].state.name).toBe("Second source");
  });

  it("maps item pages, layer home pages and layer page state to PageIds", () => {
    const { project } = parseProjectWithReport(fixtureText);
    const draw = project.layers.find((layer) => layer.id === "layer_draw")!;
    const measure = project.layers.find((layer) => layer.id === "layer_measure")!;
    expect(project.pages.find((page) => page.id === draw.items[0].pageId)?.localPage).toBe(2);
    expect(pageNumber(project, measure.items[0].pageId)).toBe(4);
    expect(draw.homePageId).toBe(project.pages[0].id);
    expect(measure.homePageId).toBe(project.pages[3].id);
    expect(draw.pageState).toEqual({ [project.pages[1].id]: { visible: false } });
  });

  it("is deterministic for the same input", () => {
    const first = parseProjectWithReport(fixtureText).project;
    const second = parseProjectWithReport(fixtureText).project;
    expect(second.pages.map((page) => page.id)).toEqual(first.pages.map((page) => page.id));
    const roundTrip = parseProjectWithReport(JSON.stringify(serializeFixture(first))).project;
    expect(roundTrip.pages.map((page) => page.id)).toEqual(first.pages.map((page) => page.id));
  });

  it("reports invalid numeric references instead of silently remapping", () => {
    const raw = fixture();
    const layers = raw.layers as Array<Record<string, unknown>>;
    (layers[0].items as Array<Record<string, unknown>>)[0].page = 99;
    layers[0].homePage = 42;
    layers[0].pageState = { "77": { visible: false } };
    (raw.pages as Record<string, unknown>)["88"] = { name: "Outside" };
    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        "projectFile.migrationInvalidItemPage",
        "projectFile.migrationInvalidLayerHome",
        "projectFile.migrationInvalidLayerPageState",
        "projectFile.migrationInvalidPageState",
      ]),
    );
    // The item is preserved on the nearest valid page, not dropped.
    const draw = project.layers.find((layer) => layer.id === "layer_draw")!;
    expect(draw.items).toHaveLength(1);
    expect(project.pages.some((page) => page.id === draw.items[0].pageId)).toBe(true);
    expect(draw.homePageId).toBeUndefined();
    expect(draw.pageState).toBeUndefined();
  });

  it("accepts every older schema through the same ladder", () => {
    for (let schemaVersion = 1; schemaVersion <= 23; schemaVersion += 1) {
      const raw = fixture();
      raw.schemaVersion = schemaVersion;
      const parsed = parseProject(JSON.stringify(raw));
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.pages).toHaveLength(4);
      expect(parsed.layers.find((layer) => layer.kind === "measure")?.items).toHaveLength(1);
    }
  });
});

function serializeFixture(project: ReturnType<typeof parseProject>): unknown {
  return {
    ...project,
    pages: project.pages.map((page) => ({
      id: page.id,
      documentId: page.documentId,
      localPage: page.localPage,
      state: page.state,
    })),
  };
}
