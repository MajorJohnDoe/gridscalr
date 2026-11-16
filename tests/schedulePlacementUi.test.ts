// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeActiveModal } from "../src/ui/dialogs";
import {
  clearSummaryFilters,
  createPlacement,
  deletePlacementsForSchedule,
  openScheduleBuilder,
  placementCount,
  renderSummaryPanel,
  setSummaryOpen,
  type SummaryPanelHost,
} from "../src/features/schedules";
import { appendSchedule } from "../src/ui/inspector/schedule";
import { showSelectionMenuAt } from "../src/ui/selectionMenu";
import type { InspectorContext } from "../src/ui/inspector/context";
import type { PanelActions } from "../src/ui/panels";
import { itemMetrics } from "../src/model/measure";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { MarkupItem, Project, ScheduleDefinition, SelectionRef } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function makeProject(pages = 2): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", pages)));
}

function lengthItem(project: Project, label: string): MarkupItem {
  const item: MarkupItem = {
    id: `item_${label.replace(/\s+/g, "_")}`,
    pageId: pageIdFor(1),
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    color: "#e30613",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    label,
  };
  addItem(project, layersForKind(project, "measure")[0].id, item);
  return item;
}

function schedule(project: Project): ScheduleDefinition {
  const entry: ScheduleDefinition = {
    id: "sched_ui",
    name: "Walls",
    source: "measurements",
    rowMode: "items",
    columns: [
      { id: "c1", field: "label", visible: true },
      { id: "c2", field: "value", visible: true, format: "unit" },
      { id: "c3", field: "unit", visible: true },
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  project.schedules.push(entry);
  return entry;
}

function placement(project: Project, overrides: Partial<MarkupItem> = {}): MarkupItem {
  const created = createPlacement(project, {
    scheduleId: "sched_ui",
    pageId: pageIdFor(1),
    width: 360,
    height: 140,
    position: { x: 24, y: 24 },
    layerName: "Schedules",
  });
  Object.assign(created!.item, overrides);
  return created!.item;
}

function button(label: string, root: ParentNode = document): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
}

function actionsStub(): PanelActions {
  return {
    refresh: vi.fn(),
    deleteSelection: vi.fn(),
    editRail: vi.fn(),
    copySelection: vi.fn(),
    cutSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    setSelectionVisible: vi.fn(),
    setSelectionLocked: vi.fn(),
    moveSelectionToLayer: vi.fn(),
    setSelectionCategory: vi.fn(),
    setSelectionRoom: vi.fn(),
    editSelectedText: vi.fn(),
  } as unknown as PanelActions;
}

function mountInspector(project: Project, item: MarkupItem, layerLocked = false) {
  const section = document.createElement("section");
  document.body.append(section);
  const layer = project.layers.find((entry) => entry.items.includes(item))!;
  layer.locked = layerLocked;
  const selection: SelectionRef = { layerId: layer.id, itemId: item.id };
  const context: InspectorContext = {
    project,
    selection,
    item,
    layer,
    actions: actionsStub(),
    locked: Boolean(item.locked) || layerLocked,
    hidden: item.visible === false,
    metrics: itemMetrics(item, project),
    section,
  };
  appendSchedule(section, context);
  return { section, context };
}

beforeEach(() => {
  clearSummaryFilters();
  setSummaryOpen(false);
});

afterEach(() => {
  closeActiveModal();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("placed table inspector", () => {
  it("shows the schedule name, row range and edit actions", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    schedule(project);
    const item = placement(project, { rowLimit: 5 });
    store.setProject(project, null);
    const { section } = mountInspector(project, item);
    expect(section.querySelector(".schedules-inspector-name")?.textContent).toBe("Walls");
    expect(button("Edit schedule…", section)).toBeTruthy();
    expect(button("Change row range…", section)).toBeTruthy();
    expect(section.textContent).toContain("All 2 rows");
  });

  it("disables editing for a locked placement", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    schedule(project);
    const item = placement(project, { locked: true });
    const { section } = mountInspector(project, item);
    expect(button("Edit schedule…", section)?.disabled).toBe(true);
    expect(button("Change row range…", section)?.disabled).toBe(true);
  });

  it("warns about a missing schedule", () => {
    const project = makeProject();
    schedule(project);
    const item = placement(project, { scheduleId: "sched_missing" });
    const { section } = mountInspector(project, item);
    expect(section.textContent).toContain("no longer exists");
    expect(button("Delete", section)).toBeTruthy();
  });

  it("offers a continuation table when the range overflows", () => {
    const project = makeProject();
    for (let index = 0; index < 30; index += 1) lengthItem(project, `Wall ${index}`);
    schedule(project);
    const item = placement(project, { rowLimit: 5 });
    item.points[1] = { x: item.points[0].x + 360, y: item.points[0].y + 60 };
    store.setProject(project, null);
    const { section } = mountInspector(project, item);
    expect(section.querySelector(".scale-warning-note")?.textContent).toContain("Continue");
    const next = button("Continue on a new table", section);
    expect(next).toBeTruthy();
    next!.click();
    expect(placementCount(store.project!, "sched_ui")).toBe(2);
  });
});

describe("placement actions", () => {
  it("adds a Place on drawing action to the summary panel", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    schedule(project);
    store.setProject(project, null);
    const container = document.createElement("div");
    document.body.append(container);
    const host: SummaryPanelHost = {
      navigateToItem: () => undefined,
      goToPage: () => undefined,
      openSpaces: () => undefined,
      refresh: () => paint(),
    };
    const paint = () => container.replaceChildren(renderSummaryPanel(host));
    paint();
    const picker = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    picker.value = "sched_ui";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    const place = button("Place on drawing…", container);
    expect(place).toBeTruthy();
    place!.click();
    expect(document.querySelector(".modal .schedules-placement")).toBeTruthy();
  });

  it("places a schedule from the dialog as one undo step", async () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    schedule(project);
    store.setProject(project, null);
    const container = document.createElement("div");
    document.body.append(container);
    const host: SummaryPanelHost = {
      navigateToItem: () => undefined,
      goToPage: () => undefined,
      openSpaces: () => undefined,
      refresh: () => paint(),
    };
    const paint = () => container.replaceChildren(renderSummaryPanel(host));
    paint();
    const picker = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    picker.value = "sched_ui";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    button("Place on drawing…", container)!.click();
    const dialog = document.querySelector<HTMLElement>(".modal")!;
    button("Place", dialog)!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(placementCount(store.project!, "sched_ui")).toBe(1);
    const placed = store
      .project!.layers.flatMap((layer) => layer.items)
      .find((item) => item.kind === "schedule")!;
    expect(store.ui.selection).toEqual([{ layerId: expect.any(String), itemId: placed.id }]);
    store.undo();
    expect(placementCount(store.project!, "sched_ui")).toBe(0);
  });

  it("adds schedule entries to the selection context menu", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    schedule(project);
    const item = placement(project);
    store.setProject(project, null);
    const layer = project.layers.find((entry) => entry.items.includes(item))!;
    store.setSelection({ layerId: layer.id, itemId: item.id });
    showSelectionMenuAt(10, 10, actionsStub());
    const labels = [...document.querySelectorAll(".popover button")].map((node) =>
      node.textContent?.trim(),
    );
    expect(labels).toContain("Edit schedule…");
    expect(labels).toContain("Change row range…");
  });

  it("names the placement count and cascades it when deleting a schedule", async () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    schedule(project);
    placement(project);
    store.setProject(project, null);
    const done = openScheduleBuilder("sched_ui");
    button("Delete", document.querySelector(".modal")!)!.click();
    const confirm = document.querySelector<HTMLElement>(".inline-confirm")!;
    expect(confirm.textContent).toContain("1 placed table");
    confirm.querySelector<HTMLButtonElement>(".btn-danger")!.click();
    expect(store.project!.schedules).toHaveLength(0);
    expect(placementCount(store.project!, "sched_ui")).toBe(0);
    store.undo();
    expect(store.project!.schedules).toHaveLength(1);
    expect(placementCount(store.project!, "sched_ui")).toBe(1);
    await done;
  });
});

describe("schedule deletion cascade helper", () => {
  it("removes only the placements of the named schedule", () => {
    const project = makeProject();
    schedule(project);
    placement(project);
    placement(project);
    expect(deletePlacementsForSchedule(project, "sched_ui")).toBe(2);
    expect(placementCount(project, "sched_ui")).toBe(0);
  });
});
