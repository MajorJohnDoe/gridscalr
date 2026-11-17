// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { TAKEOFF_SETTINGS_TABS, openTakeoffSettingsDialog } from "../src/features/takeoffSettings";
import { appendMeasurement } from "../src/ui/inspector/measurement";
import type { InspectorContext } from "../src/ui/inspector/context";
import { closeActiveModal } from "../src/ui/dialogs";
import { store } from "../src/state/store";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import { countTypeItemCount } from "../src/model/countTypes";
import type { MarkupItem, Project, ScheduleDefinition } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

// The two-column settings layout observes its scroll pane; jsdom has no layout
// engine, so the observer is stubbed for this DOM-only suite.
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
  project.fieldDefinitions.push({
    id: "field_fire",
    key: "fireClass",
    label: "Fire class",
    type: "text",
    scope: "measurement",
    order: 0,
    appliesTo: { categoryIds: [project.categories.find((entry) => entry.name === "Wall")!.id] },
  });
  project.fieldSets.push({
    id: "fset_fire",
    name: "Fire data",
    scope: "measurement",
    fieldIds: ["field_fire"],
  });
  return project;
}

function schedule(project: Project, overrides: Partial<ScheduleDefinition> = {}): void {
  project.schedules.push({
    id: "sched_hub",
    name: "Wall table",
    source: "measurements",
    rowMode: "items",
    columns: [
      { id: "c1", field: "label", visible: true },
      { id: "c2", field: "value", visible: true, format: "unit" },
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function modal(): HTMLElement {
  const node = document.querySelector<HTMLElement>(".modal");
  if (!node) throw new Error("the Takeoff settings modal did not open");
  return node;
}

function tab(label: string): HTMLButtonElement {
  const node = [...modal().querySelectorAll<HTMLButtonElement>(".dialog-nav button")].find(
    (entry) => entry.textContent?.trim() === label,
  );
  if (!node) throw new Error(`missing ${label} tab`);
  return node;
}

function button(label: string, root: ParentNode = modal()): HTMLButtonElement {
  const node = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (entry) => entry.textContent?.trim() === label || entry.getAttribute("aria-label") === label,
  );
  if (!node) throw new Error(`missing button ${label}`);
  return node;
}

function labelled<T extends HTMLElement>(label: string, root: ParentNode = modal()): T {
  const node = [...root.querySelectorAll<HTMLElement>("input, select, textarea")].find(
    (entry) => entry.getAttribute("aria-label") === label,
  );
  if (!node) throw new Error(`missing control ${label}`);
  return node as T;
}

function setValue(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event("change"));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

afterEach(() => {
  closeActiveModal();
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
  store.closeProject();
});

describe("takeoff settings hub", () => {
  it("opens on Objects and renders every tab", () => {
    const project = makeProject();
    store.setProject(project, null);
    void openTakeoffSettingsDialog();

    expect(TAKEOFF_SETTINGS_TABS).toEqual(["objects", "fields", "tables", "cards"]);
    expect(modal().querySelector(".dialog-nav")?.textContent).toContain("Objects");
    expect(modal().querySelector(".takeoff-objects")).toBeTruthy();
    expect(modal().textContent).toContain("Measured objects group lengths and areas");
    expect(modal().textContent).toContain("Counted objects are the symbols you place");
    expect(modal().querySelectorAll(".takeoff-object-row").length).toBe(
      project.categories.length + project.countTypes.length,
    );
    const heads = [...modal().querySelectorAll(".takeoff-object-table thead th")].map(
      (node) => node.textContent,
    );
    expect(heads).toEqual([
      "Object",
      "Type",
      "Unit or symbol",
      "Waste, rounding or pieces",
      "Applies to",
      "Actions",
    ]);
    expect(modal().querySelector(".takeoff-object-counted .status-chip")?.textContent).toBe(
      "Counted",
    );

    tab("Fields").click();
    expect(modal().querySelector(".takeoff-fields")).toBeTruthy();
    expect(modal().textContent).toContain("Fire class");
    expect(modal().textContent).toContain("Fire data");

    tab("Tables").click();
    expect(modal().querySelector(".takeoff-tables")).toBeTruthy();
    expect(modal().textContent).toContain("No takeoff tables yet");

    tab("Cards").click();
    expect(modal().querySelectorAll(".takeoff-card").length).toBe(4);
    expect(modal().textContent).toContain("Fed by");
    expect(modal().textContent).toContain("Rooms reads the room spaces");
  });

  it("renames and reorders a measured object in one undo step each", () => {
    const project = makeProject();
    store.setProject(project, null);
    void openTakeoffSettingsDialog();
    const wall = project.categories.find((entry) => entry.name === "Wall")!;

    const name = labelled<HTMLInputElement>("Category name: Wall");
    setValue(name, "External wall");
    expect(store.project!.categories.find((entry) => entry.id === wall.id)?.name).toBe(
      "External wall",
    );
    store.undo();
    expect(store.project!.categories.find((entry) => entry.id === wall.id)?.name).toBe("Wall");

    const row = modal().querySelector<HTMLElement>(`tr[data-object-id="${wall.id}"]`)!;
    const index = store.project!.categories.findIndex((entry) => entry.id === wall.id);
    row.querySelector<HTMLButtonElement>('button[aria-label^="Move"]')!.click();
    expect(store.project!.categories.findIndex((entry) => entry.id === wall.id)).toBe(index - 1);
    store.undo();
    expect(store.project!.categories.findIndex((entry) => entry.id === wall.id)).toBe(index);
  });

  it("adds measured and counted objects from one Add object control", () => {
    const project = makeProject();
    store.setProject(project, null);
    void openTakeoffSettingsDialog();

    const name = labelled<HTMLInputElement>("New object name");
    const kind = labelled<HTMLSelectElement>("Object type");
    name.value = "Balcony";
    setValue(kind, "measure");
    button("Add object").click();
    expect(store.project!.categories.some((entry) => entry.name === "Balcony")).toBe(true);
    store.undo();
    expect(store.project!.categories.some((entry) => entry.name === "Balcony")).toBe(false);

    name.value = "Socket";
    setValue(kind, "count");
    button("Add object").click();
    const socket = store.project!.countTypes.find((entry) => entry.label === "Socket")!;
    expect(socket).toBeTruthy();
    expect(socket.glyph).toBe("other");
    store.undo();
    expect(store.project!.countTypes.some((entry) => entry.label === "Socket")).toBe(false);
  });

  it("deletes an empty measured object immediately and a used one with its move confirmation", () => {
    const project = makeProject();
    store.setProject(project, null);
    void openTakeoffSettingsDialog();

    const name = labelled<HTMLInputElement>("New object name");
    name.value = "Temp";
    button("Add object").click();
    const temp = store.project!.categories.find((entry) => entry.name === "Temp")!;
    button("Delete Temp").click();
    expect(store.project!.categories.some((entry) => entry.id === temp.id)).toBe(false);
    store.undo();
    expect(store.project!.categories.some((entry) => entry.id === temp.id)).toBe(true);

    // The list was rebuilt by the delete, so open it again before the next
    // action uses the restored row.
    closeActiveModal();
    document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
    void openTakeoffSettingsDialog();

    const item: MarkupItem = {
      id: "item_wall",
      pageId: pageIdFor(1),
      kind: "length",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      color: "#e30613",
      strokeWidth: 2,
      scale: { pointsPerMeter: 100, sourceUnit: "m" },
      createdAt: NOW,
      updatedAt: NOW,
      categoryId: temp.id,
    };
    addItem(store.project!, layersForKind(store.project!, "measure")[0].id, item);
    const undoBefore = store.canUndo;
    button("Delete Temp").click();
    expect(modal().querySelector(".inline-confirm")?.textContent).toContain(
      "contains 1 measurement",
    );
    button("Delete category").click();
    const projectAfter = store.project!;
    expect(projectAfter.categories.some((entry) => entry.id === temp.id)).toBe(false);
    const moved = projectAfter.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === item.id);
    expect(moved?.categoryId).not.toBe(temp.id);
    store.undo();
    expect(store.project!.categories.some((entry) => entry.id === temp.id)).toBe(true);
    expect(store.canUndo).toBe(undoBefore);
  });

  it("renames, reglyphs and deletes a counted object in one undo step each", () => {
    const project = makeProject();
    store.setProject(project, null);
    void openTakeoffSettingsDialog();

    const addName = labelled<HTMLInputElement>("New object name");
    const kind = labelled<HTMLSelectElement>("Object type");
    addName.value = "Socket";
    setValue(kind, "count");
    button("Add object").click();
    const socket = store.project!.countTypes.find((entry) => entry.label === "Socket")!;

    const name = labelled<HTMLInputElement>("Count type name: Socket");
    setValue(name, "Power socket");
    expect(store.project!.countTypes.find((entry) => entry.id === socket.id)?.label).toBe(
      "Power socket",
    );
    store.undo();
    expect(store.project!.countTypes.find((entry) => entry.id === socket.id)?.label).toBe("Socket");

    const glyph = labelled<HTMLSelectElement>("Glyph for Power socket");
    setValue(glyph, "fixture");
    expect(store.project!.countTypes.find((entry) => entry.id === socket.id)?.glyph).toBe(
      "fixture",
    );
    store.undo();
    expect(store.project!.countTypes.find((entry) => entry.id === socket.id)?.glyph).toBe("other");

    const builtIn = store.project!.countTypes.find((entry) => entry.id === "door")!;
    expect(button("Delete Door").disabled).toBe(true);
    expect(countTypeItemCount(store.project!, builtIn.id)).toBe(0);

    button("Delete Socket").click();
    expect(store.project!.countTypes.some((entry) => entry.id === socket.id)).toBe(false);
    store.undo();
    expect(store.project!.countTypes.some((entry) => entry.id === socket.id)).toBe(true);
  });
});

describe("takeoff settings tables", () => {
  it("lists, duplicates and deletes saved tables", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openTakeoffSettingsDialog({ tab: "tables" });

    expect(modal().querySelector(".takeoff-table-list")?.textContent).toContain("Wall table");
    button("Duplicate").click();
    expect(store.project!.schedules).toHaveLength(2);
    store.undo();
    expect(store.project!.schedules).toHaveLength(1);

    button("Delete").click();
    expect(modal().querySelector(".inline-confirm")?.textContent).toContain("Wall table");
    button("Delete", modal().querySelector(".inline-confirm")!).click();
    expect(store.project!.schedules).toHaveLength(0);
    store.undo();
    expect(store.project!.schedules).toHaveLength(1);
  });
});

describe("takeoff settings cards", () => {
  it("toggles visibility and feeds Walls and Doors from object checkboxes", () => {
    const project = makeProject();
    store.setProject(project, null);
    void openTakeoffSettingsDialog({ tab: "cards" });

    const doorsVisible = labelled<HTMLInputElement>("Show the Doors card");
    doorsVisible.checked = false;
    doorsVisible.dispatchEvent(new Event("change"));
    expect(
      store.project!.settings.summary.cards.find((entry) => entry.id === "doors")?.visible,
    ).toBe(false);
    store.undo();
    expect(
      store.project!.settings.summary.cards.find((entry) => entry.id === "doors")?.visible,
    ).toBe(true);

    const wall = store.project!.categories.find((entry) => entry.name === "Wall")!;
    const wallFeed = labelled<HTMLInputElement>("Feed the Walls card from Wall");
    expect(wallFeed.checked).toBe(false);
    wallFeed.checked = true;
    wallFeed.dispatchEvent(new Event("change"));
    expect(store.project!.categories.find((entry) => entry.id === wall.id)?.summaryRole).toBe(
      "wall",
    );
    store.undo();
    expect(
      store.project!.categories.find((entry) => entry.id === wall.id)?.summaryRole,
    ).toBeUndefined();

    const door = store.project!.countTypes.find((entry) => entry.id === "door")!;
    const doorFeed = labelled<HTMLInputElement>("Feed the Doors card from Door");
    doorFeed.checked = true;
    doorFeed.dispatchEvent(new Event("change"));
    expect(store.project!.countTypes.find((entry) => entry.id === door.id)?.summaryRole).toBe(
      "door",
    );
  });

  it("keeps a stored source that no card uses out of the interface", () => {
    const project = makeProject();
    const wall = project.categories.find((entry) => entry.name === "Wall")!;
    const roof = project.categories.find((entry) => entry.name === "Roof")!;
    wall.summaryRole = "wall";
    roof.summaryRole = "roof";
    store.setProject(project, null);
    void openTakeoffSettingsDialog({ tab: "cards" });

    const roofFeed = labelled<HTMLInputElement>("Feed the Walls card from Roof");
    expect(roofFeed.checked).toBe(false);
    expect(modal().querySelector(".schedules-role-select")).toBeNull();
    expect(modal().textContent).not.toContain("No source");
    expect(store.project!.categories.find((entry) => entry.id === roof.id)?.summaryRole).toBe(
      "roof",
    );

    wallFeedCheck();
    expect(store.project!.categories.find((entry) => entry.id === roof.id)?.summaryRole).toBe(
      "roof",
    );
  });
});

/** Unchecks and rechecks the wall source so the list repaints. */
function wallFeedCheck(): void {
  const wallFeed = labelled<HTMLInputElement>("Feed the Walls card from Wall");
  wallFeed.checked = false;
  wallFeed.dispatchEvent(new Event("change"));
}

describe("takeoff settings deep links", () => {
  it("opens Cards on the requested card and focuses it", async () => {
    const project = makeProject();
    store.setProject(project, null);
    void openTakeoffSettingsDialog({ tab: "cards", focusId: "doors" });
    await nextFrame();
    expect(tab("Cards").getAttribute("aria-current")).toBe("true");
    expect(document.activeElement?.getAttribute("data-card-id")).toBe("doors");
  });

  it("opens Objects on the requested row and focuses its name", async () => {
    const project = makeProject();
    const wall = project.categories.find((entry) => entry.name === "Wall")!;
    store.setProject(project, null);
    void openTakeoffSettingsDialog({ tab: "objects", focusId: wall.id });
    await nextFrame();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Category name: Wall");
  });

  it("opens Objects from the inspector category action", async () => {
    const project = makeProject();
    const layer = layersForKind(project, "measure")[0];
    const item: MarkupItem = {
      id: "item_inspector",
      pageId: pageIdFor(1),
      kind: "length",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      color: "#e30613",
      strokeWidth: 2,
      scale: { pointsPerMeter: 100, sourceUnit: "m" },
      createdAt: NOW,
      updatedAt: NOW,
      categoryId: project.categories.find((entry) => entry.name === "Wall")!.id,
    };
    addItem(project, layer.id, item);
    store.setProject(project, null);
    const section = document.createElement("section");
    document.body.append(section);
    appendMeasurement(section, {
      project,
      selection: { layerId: layer.id, itemId: item.id },
      item,
      layer,
      actions: {} as InspectorContext["actions"],
      locked: false,
      hidden: false,
      metrics: {} as InspectorContext["metrics"],
      section,
    });
    const edit = [...section.querySelectorAll<HTMLButtonElement>("button")].find((entry) =>
      entry.textContent?.includes("Edit object"),
    )!;
    edit.click();
    await nextFrame();
    expect(tab("Objects").getAttribute("aria-current")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Category name: Wall");
  });
});
