import { describe, expect, it } from "vitest";
import {
  addItem,
  cloneItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layerKindForItem,
  layersForKind,
} from "../src/model/layers";
import { hitTest } from "../src/model/hitTest";
import {
  COUNT_LABEL_OFFSET,
  COUNT_SYMBOL_RADIUS,
  COUNT_TYPES,
  countSymbol,
  countTypeLabel,
} from "../src/model/countSymbols";
import { itemLabel, itemMetrics } from "../src/model/measure";
import { labelAnchorForPoints, measurementLabelParts } from "../src/model/label";
import { layoutPageLabels, pageLabelSources } from "../src/model/labelLayout";
import type { LabelMeasure } from "../src/model/label";
import { toolLayerKind } from "../src/state/store";
import type { MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  return createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
}

function makeCount(overrides: Partial<MarkupItem> = {}): MarkupItem {
  return {
    id: "item_count",
    page: 1,
    kind: "count",
    points: [{ x: 150, y: 100 }],
    color: "#4cc9f0",
    strokeWidth: 2,
    countType: "door",
    categoryId: "cat",
    room: "Room 101",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("count symbols", () => {
  it("provides vector geometry for every built-in type", () => {
    for (const type of COUNT_TYPES) {
      const symbol = countSymbol(type);
      expect(symbol.paths.length).toBeGreaterThan(0);
      for (const path of symbol.paths) {
        for (const point of path.points) {
          expect(Math.abs(point.x)).toBeLessThanOrEqual(COUNT_SYMBOL_RADIUS + 1e-9);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(COUNT_SYMBOL_RADIUS + 1e-9);
        }
      }
    }
    expect(countSymbol("door")).not.toEqual(countSymbol("other"));
    expect(countTypeLabel("window")).toBe("Window");
    expect(countTypeLabel(undefined)).toBe("Other");
  });
});

describe("count hit testing", () => {
  it("uses an anchor radius and ignores hidden or locked counts", () => {
    const project = makeProject();
    const layer = layersForKind(project, "measure")[0];
    addItem(project, layer.id, makeCount());

    expect(hitTest(project, 1, { x: 154, y: 100 }, 6)?.item.id).toBe("item_count");
    expect(hitTest(project, 1, { x: 160, y: 100 }, 6)).toBeNull();

    const hiddenProject = makeProject();
    const hiddenLayer = layersForKind(hiddenProject, "measure")[0];
    addItem(hiddenProject, hiddenLayer.id, makeCount({ visible: false }));
    expect(hitTest(hiddenProject, 1, { x: 150, y: 100 }, 6)).toBeNull();

    const lockedProject = makeProject();
    const lockedLayer = layersForKind(lockedProject, "measure")[0];
    addItem(lockedProject, lockedLayer.id, makeCount({ locked: true }));
    expect(hitTest(lockedProject, 1, { x: 150, y: 100 }, 6)).toBeNull();
    expect(
      hitTest(lockedProject, 1, { x: 150, y: 100 }, 6, { includeLocked: true })?.item.id,
    ).toBe("item_count");
  });
});

describe("count metrics and labels", () => {
  it("always measures one piece and names the object type", () => {
    const project = makeProject();
    const item = makeCount();
    const metrics = itemMetrics(item, project);

    expect(metrics?.primary).toBe("1 pcs");
    expect(metrics?.secondary).toBe("Door");
    expect(metrics?.unit).toBe("pcs");
    expect(metrics?.rawPoints).toBe(1);
    expect(itemLabel(item, project)).toBe("1 pcs");
    expect(measurementLabelParts(item, project)).toEqual({
      text: "1 pcs",
      secondary: "Door",
    });
    expect(
      measurementLabelParts(makeCount({ label: "D1" }), project),
    ).toEqual({ text: "D1 · 1 pcs", secondary: "Door" });
  });

  it("places the label clear of the symbol", () => {
    const anchor = { x: 150, y: 100 };
    expect(
      labelAnchorForPoints(makeCount({ points: [anchor] }), [anchor]),
    ).toEqual({ x: 150, y: 100 - COUNT_LABEL_OFFSET });
  });

  it("includes counts in the page label layout", () => {
    const project = makeProject();
    const layer = layersForKind(project, "measure")[0];
    const item = makeCount();
    addItem(project, layer.id, item);

    const source = pageLabelSources(project, 1).find((entry) => entry.id === item.id);
    expect(source?.kind).toBe("count");
    expect(source?.obstacle).toEqual({
      min: { x: 144, y: 94 },
      max: { x: 156, y: 106 },
    });

    const measure: LabelMeasure = (text, size) => text.length * size * 0.55;
    const layout = layoutPageLabels(source ? [source] : [], {
      pageSize: { width: 300, height: 200 },
      measure,
    }).get(item.id);
    expect(layout).toBeDefined();
    expect(layout!.text).toBe("1 pcs");
    expect(layout!.secondary).toBe("Door");
    expect(layout!.box.y + layout!.box.height).toBeLessThanOrEqual(100 - COUNT_SYMBOL_RADIUS);
  });
});

describe("count layer and clipboard rules", () => {
  it("treats counts as measurements", () => {
    expect(layerKindForItem("count")).toBe("measure");
    expect(toolLayerKind("count")).toBe("measure");
  });

  it("keeps category, room and type when copied", () => {
    const copy = cloneItem(makeCount());
    expect(copy.kind).toBe("count");
    expect(copy.countType).toBe("door");
    expect(copy.categoryId).toBe("cat");
    expect(copy.room).toBe("Room 101");
    expect(copy.visible).toBe(true);
    expect(copy.locked).toBe(false);
  });
});
