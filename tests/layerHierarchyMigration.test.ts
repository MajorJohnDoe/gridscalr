import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProjectWithReport, serializeProject } from "../src/io/projectFile";
import { validateProject } from "../src/model/integrity";
import type { Project } from "../src/model/types";
import { SCHEMA_VERSION } from "../src/model/types";

const SCHEMA_25 = readFileSync(
  new URL("../fixtures/legacy/schema-25.gridscalr", import.meta.url),
  "utf8",
);
const SCHEMA_26 = readFileSync(
  new URL("../fixtures/legacy/schema-26.gridscalr", import.meta.url),
  "utf8",
);

function rawFixture(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

function rawLayers(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  return raw.layers as Array<Record<string, unknown>>;
}

function layerById(project: Project, id: string) {
  return project.layers.find((layer) => layer.id === id);
}

function issueCodes(project: Project): string[] {
  return validateProject(project).map((issue) => issue.code);
}

/** A stable JSON string: `serializeProject` stamps `updatedAt` on purpose. */
function stableJson(project: Project): string {
  return JSON.stringify({ ...project, updatedAt: "fixed" });
}

describe("schema 25 → 26 layer hierarchy migration", () => {
  it("keeps every schema 25 layer as a root with unchanged identity", () => {
    const raw = rawFixture(SCHEMA_25);
    const { project, report } = parseProjectWithReport(SCHEMA_25);
    expect(SCHEMA_VERSION).toBe(26);
    expect(report.migratedFrom).toBe(25);
    expect(project.schemaVersion).toBe(26);
    expect(project.layers.map((layer) => layer.id)).toEqual(
      rawLayers(raw).map((layer) => layer.id),
    );
    expect(project.layers.every((layer) => layer.parentId === undefined)).toBe(true);
    expect(report.repaired.some((entry) => entry.code === "repairedLayerParent")).toBe(false);
    expect(project.pages.map((page) => page.id)).toEqual(
      (raw.pages as Array<Record<string, unknown>>).map((page) => page.id),
    );
  });

  it("keeps a schema 26 hierarchy, its page state and its item identity", () => {
    const raw = rawFixture(SCHEMA_26);
    const { project, report } = parseProjectWithReport(SCHEMA_26);
    expect(report.migratedFrom).toBe(26);
    expect(project.schemaVersion).toBe(26);
    expect(layerById(project, "layer_group")?.parentId).toBeUndefined();
    expect(layerById(project, "layer_measure")?.parentId).toBe("layer_group");
    expect(layerById(project, "layer_group")?.pageState).toEqual({
      [project.pages[1].id]: { locked: true },
    });
    expect(project.layers.map((layer) => layer.id)).toEqual(
      rawLayers(raw).map((layer) => layer.id),
    );
    expect(
      project.layers.flatMap((layer) => layer.items.map((item) => [item.id, item.pageId])),
    ).toEqual(
      rawLayers(raw).flatMap((layer) =>
        (layer.items as Array<Record<string, unknown>>).map((item) => [
          item.id,
          item.pageId ?? item.page,
        ]),
      ),
    );
    expect(report.dropped).toEqual([]);
    expect(report.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("migrates deterministically and survives a round trip", () => {
    for (const text of [SCHEMA_25, SCHEMA_26]) {
      const first = parseProjectWithReport(text).project;
      const second = parseProjectWithReport(text).project;
      expect(stableJson(second)).toBe(stableJson(first));

      const roundTrip = parseProjectWithReport(serializeProject(first)).project;
      expect(roundTrip.layers.map((layer) => [layer.id, layer.parentId])).toEqual(
        first.layers.map((layer) => [layer.id, layer.parentId]),
      );
      expect(roundTrip.pages.map((page) => page.id)).toEqual(first.pages.map((page) => page.id));
      expect(roundTrip.layers.flatMap((layer) => layer.items.map((item) => item.id))).toEqual(
        first.layers.flatMap((layer) => layer.items.map((item) => item.id)),
      );
    }
  });

  it("ignores a parent marker in an older schema and reports the repair", () => {
    const raw = rawFixture(SCHEMA_25);
    const layers = rawLayers(raw);
    layers[0].parentId = "layer_measure";
    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(project.layers.every((layer) => layer.parentId === undefined)).toBe(true);
    expect(report.repaired).toContainEqual({ code: "repairedLayerParent", count: 1 });
  });

  it("reports malformed parent values instead of dropping a layer", () => {
    const raw = rawFixture(SCHEMA_26);
    const layers = rawLayers(raw);
    const child = layers.find((layer) => layer.id === "layer_measure")!;
    child.parentId = 42;
    const { project, report } = parseProjectWithReport(JSON.stringify(raw));
    expect(project.layers).toHaveLength(layers.length);
    expect(layerById(project, "layer_measure")?.parentId).toBeUndefined();
    expect(report.repaired).toContainEqual({ code: "repairedLayerParent", count: 1 });
  });

  it("reports a missing parent, a cycle and a cross-kind parent without data loss", () => {
    const cases: Array<{
      code: string;
      layerId: string;
      apply: (layers: Array<Record<string, unknown>>) => void;
    }> = [
      {
        code: "missingLayerParent",
        layerId: "layer_measure",
        apply: (layers) => {
          layers.find((layer) => layer.id === "layer_measure")!.parentId = "layer_missing";
        },
      },
      {
        code: "layerParentCycle",
        layerId: "layer_group",
        apply: (layers) => {
          layers.find((layer) => layer.id === "layer_group")!.parentId = "layer_measure";
        },
      },
      {
        code: "layerParentKindMismatch",
        layerId: "layer_group",
        apply: (layers) => {
          layers.find((layer) => layer.id === "layer_group")!.parentId = "layer_draw";
        },
      },
    ];
    for (const entry of cases) {
      const raw = rawFixture(SCHEMA_26);
      const layers = rawLayers(raw);
      entry.apply(layers);
      const rawItemIds = layers.flatMap((layer) =>
        (layer.items as Array<Record<string, unknown>>).map((item) => item.id),
      );
      const { project, report } = parseProjectWithReport(JSON.stringify(raw));

      expect(report.issues.map((issue) => [issue.code, issue.entity?.id])).toContainEqual([
        entry.code,
        entry.layerId,
      ]);
      expect(report.dropped).toEqual([]);
      expect(project.layers).toHaveLength(layers.length);
      expect(project.layers.flatMap((layer) => layer.items.map((item) => item.id))).toEqual(
        rawItemIds,
      );
      // The broken link is preserved, not silently cleared or reparented.
      expect(layerById(project, entry.layerId)?.parentId).toBeDefined();
      expect(issueCodes(project)).toContain(entry.code);
    }
  });
});
