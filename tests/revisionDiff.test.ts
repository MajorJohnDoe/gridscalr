import { describe, expect, it } from "vitest";
import { compareRevisions } from "../src/compare/revisionDiff";
import { createManualCalibration } from "../src/model/calibration";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(name = "Revision A", pages = 2): Project {
  const project = createProject(defaultDocument("Plan.pdf", pages), createDefaultLayers());
  project.name = name;
  project.pages["1"] = { name: "Ground floor", calibration: createManualCalibration(100) };
  if (pages > 1) project.pages["2"] = { calibration: createManualCalibration(100) };
  return project;
}

function add(project: Project, item: Partial<MarkupItem> & Pick<MarkupItem, "kind">): MarkupItem {
  const created: MarkupItem = {
    id: `item_${Math.random().toString(36).slice(2)}`,
    page: 1,
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    scale: { pointsPerMeter: 100, sourceUnit: "m" },
    createdAt: NOW,
    updatedAt: NOW,
    ...item,
  };
  const kind =
    created.kind === "length" || created.kind === "area" || created.kind === "count"
      ? "measure"
      : "draw";
  addItem(project, layersForKind(project, kind)[0].id, created);
  return created;
}

describe("revision diff", () => {
  it("matches by id and reports changed fields", () => {
    const current = makeProject();
    const reference = structuredClone(current);
    const item = add(current, { id: "wall", kind: "length", label: "Wall" });
    const mirror = structuredClone(item);
    mirror.color = "#ff0000";
    add(reference, mirror);

    const diff = compareRevisions(current, reference);
    expect(diff.summary.changed).toBe(1);
    expect(diff.summary.added).toBe(0);
    expect(diff.summary.removed).toBe(0);
    const entry = diff.items.find((candidate) => candidate.label === "Wall")!;
    expect(entry.status).toBe("changed");
    expect(entry.changes.map((change) => change.field)).toContain("color");
  });

  it("matches identical geometry even when ids differ", () => {
    const current = makeProject();
    const reference = structuredClone(current);
    add(current, { id: "current-wall", kind: "length", label: "Wall", color: "#00ff00" });
    add(reference, { id: "reference-wall", kind: "length", label: "Wall", color: "#ff0000" });

    const diff = compareRevisions(current, reference);
    expect(diff.summary).toMatchObject({ added: 0, removed: 0, changed: 1 });
    const entry = diff.items[0];
    expect(entry.changes.find((change) => change.field === "color")).toMatchObject({
      before: "#ff0000",
      after: "#00ff00",
    });
  });

  it("matches moved items inside the tolerance and reports geometry", () => {
    const current = makeProject();
    const reference = structuredClone(current);
    const item = add(current, {
      id: "moved",
      kind: "text",
      text: "Note",
      points: [{ x: 50, y: 50 }],
    });
    const mirror = structuredClone(item);
    mirror.id = "moved-reference";
    mirror.points = [{ x: 56, y: 50 }];
    add(reference, mirror);

    const diff = compareRevisions(current, reference);
    expect(diff.summary).toMatchObject({ added: 0, removed: 0, changed: 1 });
    expect(diff.items[0].changes.map((change) => change.field)).toContain("points");
  });

  it("reports items outside the tolerance as added and removed", () => {
    const current = makeProject();
    const reference = structuredClone(current);
    const item = add(current, {
      id: "far",
      kind: "text",
      text: "Note",
      points: [{ x: 50, y: 50 }],
    });
    const mirror = structuredClone(item);
    mirror.id = "far-reference";
    mirror.points = [{ x: 200, y: 200 }];
    add(reference, mirror);

    const diff = compareRevisions(current, reference);
    expect(diff.summary).toMatchObject({ added: 1, removed: 1, changed: 0 });
  });

  it("tracks added and removed items and page summaries", () => {
    const current = makeProject();
    const reference = structuredClone(current);
    add(current, { kind: "area", label: "New room" });
    add(reference, { kind: "count", label: "Old door" });
    add(current, { id: "same", kind: "length", label: "Same" });
    add(reference, { id: "same", kind: "length", label: "Same" });

    const diff = compareRevisions(current, reference);
    expect(diff.summary).toMatchObject({ added: 1, removed: 1, changed: 0, unchanged: 1 });
    expect(diff.items.find((item) => item.status === "added")?.label).toBe("New room");
    expect(diff.items.find((item) => item.status === "removed")?.label).toBe("Old door");
    const page = diff.pages.find((entry) => entry.page === 1)!;
    expect(page).toMatchObject({ pageName: "Ground floor", added: 1, removed: 1, unchanged: 1 });
  });

  it("warns about page counts, drawing names and scale differences", () => {
    const current = makeProject("Revision A", 2);
    const reference = makeProject("Revision B", 1);
    reference.documents[0].name = "Other plan.pdf";
    reference.pages["1"] = { calibration: createManualCalibration(50) };

    const diff = compareRevisions(current, reference);
    expect(diff.summary.pages).toBe(2);
    expect(diff.warnings.join(" ")).toMatch(/Page counts differ/);
    expect(diff.warnings.join(" ")).toMatch(/different drawing files/);
    expect(diff.warnings.join(" ")).toMatch(/Page 1 scales differ/);
  });

  it("does not treat timestamp-only changes as edits", () => {
    const current = makeProject();
    const reference = structuredClone(current);
    const item = add(current, { id: "stable", kind: "length", label: "Stable" });
    add(reference, { ...structuredClone(item), updatedAt: "2026-02-02T00:00:00.000Z" });

    const diff = compareRevisions(current, reference);
    expect(diff.summary).toMatchObject({ added: 0, removed: 0, changed: 0, unchanged: 1 });
  });
});
