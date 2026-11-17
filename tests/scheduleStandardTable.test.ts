// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSummaryFilters,
  computeSchedule,
  createAndPlaceStandardSchedule,
  createSchedule,
  createStandardSchedule,
  openScheduleBuilder,
  placementCount,
  renderSummaryPanel,
  setSummaryOpen,
  standardScheduleDraft,
  type SummaryPanelHost,
} from "../src/features/schedules";
import { openTakeoffSettingsDialog } from "../src/features/takeoffSettings";
import { closeActiveModal } from "../src/ui/dialogs";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { MarkupItem, Project, ScheduleDefinition } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

// The two-column settings layout observes its scroll pane; jsdom has no layout
// engine, so the observer is stubbed for the hub assertions.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  return project;
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

function savedSchedule(project: Project): ScheduleDefinition {
  const entry: ScheduleDefinition = {
    id: "sched_saved",
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

function button(label: string, root: ParentNode = document): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
}

function labelled<T extends HTMLElement>(label: string): T | null {
  const byAria = document.querySelector<T>(`[aria-label="${label}"]`);
  if (byAria) return byAria;
  for (const node of document.querySelectorAll("label")) {
    const text = node.querySelector(".field-label")?.textContent?.trim();
    if (text !== label) continue;
    return node.querySelector<T>("input, select, textarea");
  }
  return null;
}

function toastText(): string {
  return document.querySelector(".toast-stack")?.textContent?.trim() ?? "";
}

function scheduledItems(project: Project): MarkupItem[] {
  return project.layers.flatMap((layer) => layer.items).filter((item) => item.kind === "schedule");
}

function mountPanel(hostOverrides: Partial<SummaryPanelHost> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const host: SummaryPanelHost = {
    navigateToItem: () => undefined,
    goToPage: () => undefined,
    openSpaces: () => undefined,
    refresh: () => paint(),
    ...hostOverrides,
  };
  function paint() {
    container.replaceChildren(renderSummaryPanel(host));
  }
  paint();
  return { container, host, paint };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  clearSummaryFilters();
  setSummaryOpen(false);
});

afterEach(() => {
  closeActiveModal();
  // The toast module keeps its stack element; keep it attached and empty so a
  // later test's toast is visible instead of appending to a detached node.
  for (const child of [...document.body.children]) {
    if (child.classList.contains("toast-stack")) child.replaceChildren();
    else child.remove();
  }
  store.setReadOnly(false);
  store.closeProject();
});

describe("standard takeoff table factory", () => {
  it("builds the standard shape and a unique localized name", () => {
    const project = makeProject();
    const draft = standardScheduleDraft(project);
    expect(draft.name).toBe("Standard");
    expect(draft.source).toBe("measurements");
    expect(draft.rowMode).toBe("items");
    expect(draft.columns.map((column) => column.field)).toEqual([
      "label",
      "countQuantity",
      "unit",
      "value",
    ]);
    expect(draft.columns.map((column) => column.label)).toEqual([
      "Object",
      "Count",
      "Unit",
      "Value",
    ]);
    expect(draft.filters).toEqual({});
    expect(draft.groupBy).toBeUndefined();
    expect(draft.sort).toEqual([]);
    expect(draft.totals).toEqual([]);

    project.schedules.push({
      id: "sched_existing",
      name: "Standard",
      source: "measurements",
      rowMode: "items",
      columns: [{ id: "c1", field: "label", visible: true }],
      filters: {},
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(standardScheduleDraft(project).name).toBe("Standard (2)");
  });

  it("computes one row per visible item", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    lengthItem(project, "Wall B");
    const created = createSchedule(project, standardScheduleDraft(project));
    expect(created.schedule).toBeTruthy();
    expect(computeSchedule(project, created.schedule!).rowCount).toBe(2);
  });
});

describe("no table preview", () => {
  it("writes nothing when the tab is opened", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    store.setProject(project, null);
    const before = JSON.stringify(store.project);
    const revision = store.revision;
    const { container } = mountPanel();

    expect(container.querySelector(".schedules-preview")).toBeTruthy();
    expect(store.project!.schedules).toHaveLength(0);
    expect(JSON.stringify(store.project)).toBe(before);
    expect(store.revision).toBe(revision);
    expect(store.dirty).toBe(false);
    expect(store.canUndo).toBe(false);
  });

  it("renders both actions with an explanation", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    store.setProject(project, null);
    const { container } = mountPanel();
    const preview = container.querySelector<HTMLElement>(".schedules-preview")!;
    expect(preview.querySelector(".schedules-preview-title")?.textContent).toBe(
      "Preview – cannot be placed",
    );
    expect(preview.querySelector(".schedules-preview-hint")?.textContent).toContain(
      "Create a takeoff table",
    );
    const create = preview.querySelector<HTMLButtonElement>(
      '[data-summary-focus="preview-create"]',
    )!;
    const createPlace = preview.querySelector<HTMLButtonElement>(
      '[data-summary-focus="preview-create-place"]',
    )!;
    expect(create.textContent).toBe("Create takeoff table");
    expect(createPlace.textContent).toBe("Create takeoff table and place…");
    expect(create.type).toBe("button");
    expect(createPlace.type).toBe("button");
    expect(create.disabled).toBe(false);
    expect(createPlace.disabled).toBe(false);
  });

  it("disables both actions with a reason in a view-only session", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    store.setProject(project, null);
    store.setReadOnly(true);
    const { container } = mountPanel();
    const create = container.querySelector<HTMLButtonElement>(
      '[data-summary-focus="preview-create"]',
    )!;
    const createPlace = container.querySelector<HTMLButtonElement>(
      '[data-summary-focus="preview-create-place"]',
    )!;
    expect(create.disabled).toBe(true);
    expect(createPlace.disabled).toBe(true);
    expect(create.title).toBe(
      "The session is read-only, so editing, placing and importing are unavailable.",
    );
    expect(createPlace.getAttribute("aria-describedby")).toBe("schedules-action-reason");
    expect(store.project!.schedules).toHaveLength(0);
  });

  it("selects the first saved table instead of the no-table preview", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    const saved = savedSchedule(project);
    store.setProject(project, null);
    const before = JSON.stringify(store.project);
    const revision = store.revision;
    const { container } = mountPanel({
      exportScheduleCsv: () => undefined,
      importScheduleCsv: () => undefined,
    });

    const picker = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    expect(picker.value).toBe(saved.id);
    expect(container.querySelector(".schedules-preview")).toBeNull();
    expect(container.querySelector(".schedules-built-in")).toBeNull();
    expect(container.querySelectorAll(".schedules-row-link")).toHaveLength(1);
    expect(container.querySelector(".schedules-action-reason")).toBeNull();
    for (const focus of ["place", "edit", "export", "import"]) {
      expect(
        container.querySelector<HTMLButtonElement>(`[data-summary-focus="${focus}"]`)?.disabled,
      ).toBe(false);
    }
    // Session selection only: the project is byte-identical and not dirty.
    expect(JSON.stringify(store.project)).toBe(before);
    expect(store.revision).toBe(revision);
    expect(store.dirty).toBe(false);
    expect(store.canUndo).toBe(false);
  });

  it("keeps the built-in preview selectable without a create block", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    savedSchedule(project);
    store.setProject(project, null);
    const before = JSON.stringify(store.project);
    const { container } = mountPanel({
      exportScheduleCsv: () => undefined,
      importScheduleCsv: () => undefined,
    });
    const picker = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    picker.value = "";
    picker.dispatchEvent(new Event("change", { bubbles: true }));

    const current = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    expect(current.value).toBe("");
    expect(container.querySelector(".schedules-preview")).toBeNull();
    expect(container.querySelector('[data-summary-focus="preview-create"]')).toBeNull();
    expect(container.querySelector('[data-summary-focus="preview-create-place"]')).toBeNull();
    expect(container.querySelector(".schedules-built-in")).toBeTruthy();
    const reason = container.querySelector(".schedules-action-reason")!;
    expect(reason.textContent).toBe(
      "Select a saved takeoff table to edit, place, export or import it.",
    );
    const place = container.querySelector<HTMLButtonElement>('[data-summary-focus="place"]')!;
    expect(place.disabled).toBe(true);
    expect(place.getAttribute("aria-describedby")).toBe(reason.id);
    expect(JSON.stringify(store.project)).toBe(before);
  });

  it("creates and selects the standard table in one undo step", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    store.setProject(project, null);
    const exportCsv = () => undefined;
    const importCsv = () => undefined;
    const { container } = mountPanel({
      exportScheduleCsv: exportCsv,
      importScheduleCsv: importCsv,
    });

    container.querySelector<HTMLButtonElement>('[data-summary-focus="preview-create"]')!.click();
    expect(store.project!.schedules).toHaveLength(1);
    const created = store.project!.schedules[0];
    expect(created.source).toBe("measurements");
    expect(created.rowMode).toBe("items");
    expect(created.columns.map((column) => column.field)).toEqual([
      "label",
      "countQuantity",
      "unit",
      "value",
    ]);
    expect(created.filters).toEqual({});
    expect(store.canUndo).toBe(true);
    expect(store.dirty).toBe(true);
    expect(toastText()).toContain("Takeoff table “Standard” created.");

    const picker = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    expect(picker.value).toBe(created.id);
    expect(container.querySelector(".schedules-action-reason")).toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>('[data-summary-focus="place"]')?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>('[data-summary-focus="edit"]')?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>('[data-summary-focus="export"]')?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>('[data-summary-focus="import"]')?.disabled,
    ).toBe(false);

    store.undo();
    expect(store.project!.schedules).toHaveLength(0);
    expect(store.canRedo).toBe(true);
  });

  it("keeps Import CSV to the existing row-mode rule", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    store.setProject(project, null);
    const { container, paint } = mountPanel({ importScheduleCsv: () => undefined });
    container.querySelector<HTMLButtonElement>('[data-summary-focus="preview-create"]')!.click();
    const schedule = store.project!.schedules[0] as ScheduleDefinition;
    expect(
      container.querySelector<HTMLButtonElement>('[data-summary-focus="import"]')?.disabled,
    ).toBe(false);

    store.mutate((current) => {
      current.schedules[0].rowMode = "grouped";
    }, "change");
    paint();
    const importCsv = container.querySelector<HTMLButtonElement>('[data-summary-focus="import"]')!;
    expect(store.project!.schedules[0].id).toBe(schedule.id);
    expect(importCsv.disabled).toBe(true);
    expect(importCsv.title).toBe("Grouped takeoff tables export read-only and cannot be imported.");
  });
});

describe("create and place", () => {
  it("writes nothing when the placement dialog is cancelled", async () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    store.setProject(project, null);
    const before = JSON.stringify(store.project);
    const revision = store.revision;
    const { container } = mountPanel();
    container
      .querySelector<HTMLButtonElement>('[data-summary-focus="preview-create-place"]')!
      .click();
    const dialog = document.querySelector<HTMLElement>(".modal .schedules-placement");
    expect(dialog).toBeTruthy();
    button("Cancel")!.click();
    await tick();
    expect(JSON.stringify(store.project)).toBe(before);
    expect(store.revision).toBe(revision);
    expect(store.project!.schedules).toHaveLength(0);
    expect(scheduledItems(store.project!)).toHaveLength(0);
  });

  it("creates and places in one undo step on a draw layer", async () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    store.setProject(project, null);
    // The active layer of a new project is a measurement layer.
    const active = store.project!.layers.find((layer) => layer.id === store.project!.activeLayerId);
    expect(active?.kind).toBe("measure");
    const { container } = mountPanel();
    container
      .querySelector<HTMLButtonElement>('[data-summary-focus="preview-create-place"]')!
      .click();
    button("Place")!.click();
    await tick();

    expect(store.project!.schedules).toHaveLength(1);
    const created = store.project!.schedules[0];
    expect(created.name).toBe("Standard");
    expect(placementCount(store.project!, created.id)).toBe(1);
    const placed = scheduledItems(store.project!)[0];
    const layer = store.project!.layers.find((entry) => entry.items.includes(placed))!;
    expect(layer.kind).toBe("draw");
    expect(store.project!.layers.filter((entry) => entry.kind === "measure")).not.toContain(layer);
    expect(store.ui.selection).toEqual([{ layerId: layer.id, itemId: placed.id }]);
    const picker = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    expect(picker.value).toBe(created.id);
    expect(toastText()).toContain("Standard takeoff table created.");
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project!.schedules).toHaveLength(0);
    expect(scheduledItems(store.project!)).toHaveLength(0);
    store.redo();
    expect(store.project!.schedules).toHaveLength(1);
    expect(scheduledItems(store.project!)).toHaveLength(1);
  });

  it("creates a localized draw layer when none exists", async () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    project.layers = project.layers.filter((layer) => layer.kind !== "draw");
    project.activeLayerId = project.layers[0].id;
    store.setProject(project, null);

    const done = createAndPlaceStandardSchedule();
    button("Place")!.click();
    const schedule = await done;
    expect(schedule?.name).toBe("Standard");
    const placed = scheduledItems(store.project!)[0];
    const layer = store.project!.layers.find((entry) => entry.items.includes(placed))!;
    expect(layer.kind).toBe("draw");
    expect(layer.name).toBe("Takeoff tables");
  });
});

describe("standard table lifecycle", () => {
  it("is editable in the builder and listed in the hub", () => {
    const project = makeProject();
    lengthItem(project, "Wall A");
    store.setProject(project, null);
    const schedule = createStandardSchedule();
    expect(schedule).toBeTruthy();

    void openScheduleBuilder(schedule!.id);
    expect(labelled<HTMLInputElement>("Name")?.value).toBe("Standard");
    expect(document.querySelectorAll(".schedules-builder-column")).toHaveLength(4);
    closeActiveModal();

    void openTakeoffSettingsDialog({ tab: "tables" });
    const modal = document.querySelector<HTMLElement>(".modal")!;
    expect(modal.querySelectorAll(".takeoff-table-row")).toHaveLength(1);
    expect(modal.textContent).toContain("Standard");
  });
});
