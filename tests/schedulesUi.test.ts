// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openScheduleBuilder,
  renderSummaryPanel,
  setCategorySummaryRole,
  setCountTypeSummaryRole,
  setSummaryOpen,
  isSummaryOpen,
  clearSummaryFilters,
  type SummaryPanelHost,
} from "../src/features/schedules";
import { closeActiveModal } from "../src/ui/dialogs";
import { dragPointer, rect } from "./helpers/pointer";
import { createSpace, emptySpaceDraft } from "../src/features/spaces";
import {
  addItem,
  createProject,
  defaultDocument,
  layersForKind,
  setLayerVisibleOnPage,
  addLayer,
} from "../src/model/layers";
import type { MarkupItem, Project, ScheduleDefinition, Space } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function makeProject(pages = 2): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", pages)));
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  return project;
}

function measureLayer(project: Project) {
  return layersForKind(project, "measure")[0];
}

function lengthItem(
  project: Project,
  options: { label: string; meters?: number; page?: number; categoryId?: string; locked?: boolean },
): MarkupItem {
  const item: MarkupItem = {
    id: `item_${options.label.replace(/\s+/g, "_")}`,
    pageId: pageIdFor(options.page ?? 1),
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: (options.meters ?? 1) * 100, y: 0 },
    ],
    color: "#e30613",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    label: options.label,
    ...(options.categoryId ? { categoryId: options.categoryId } : {}),
    ...(options.locked ? { locked: true } : {}),
  };
  addItem(project, measureLayer(project).id, item);
  return item;
}

function areaItem(project: Project, spaceId?: string): MarkupItem {
  const item: MarkupItem = {
    id: `item_area_${Math.random().toString(36).slice(2)}`,
    pageId: pageIdFor(1),
    kind: "area",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    ...(spaceId ? { spaceId } : {}),
  };
  addItem(project, measureLayer(project).id, item);
  return item;
}

function space(project: Project, name: string, kind: Space["kind"] = "room"): Space {
  const result = createSpace(project, {
    ...emptySpaceDraft(project.spaces),
    name,
    kind,
  });
  expect(result.problems).toEqual([]);
  return result.space!;
}

function schedule(
  project: Project,
  overrides: Partial<ScheduleDefinition> = {},
): ScheduleDefinition {
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
    ...overrides,
  };
  project.schedules.push(entry);
  return entry;
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

function button(label: string, root: ParentNode = document): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
}

function setValue(
  node: HTMLInputElement | HTMLSelectElement,
  value: string,
  event = "change",
): void {
  node.value = value;
  node.dispatchEvent(new Event(event, { bubbles: true }));
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

beforeEach(() => {
  clearSummaryFilters();
  setSummaryOpen(false);
});

afterEach(() => {
  closeActiveModal();
  document.body.replaceChildren();
});

describe("summary panel", () => {
  it("shows the four cards and the built-in table", () => {
    const project = makeProject();
    const room = space(project, "Kitchen");
    areaItem(project, room.id);
    space(project, "Missing");
    const wall = project.categories.find((category) => category.name === "Wall")!;
    setCategorySummaryRole(project, wall.id, "wall");
    lengthItem(project, { label: "Wall A", categoryId: wall.id });
    const door = project.countTypes.find((type) => type.id === "door")!;
    setCountTypeSummaryRole(project, door.id, "door");
    store.setProject(project, null);

    const { container } = mountPanel();
    expect(
      container.querySelector(".schedules-card-rooms .schedules-card-value")?.textContent,
    ).toBe("2");
    expect(container.querySelector(".schedules-card-area .schedules-card-value")?.textContent).toBe(
      "1",
    );
    expect(
      container.querySelector(".schedules-card-wallLength .schedules-card-value")?.textContent,
    ).toBe("1");
    expect(
      container.querySelector(".schedules-card-doors .schedules-card-value")?.textContent,
    ).toBe("0");
    expect(
      container.querySelector(".schedules-card-area .schedules-card-note")?.textContent,
    ).toContain("1");
    expect(container.querySelectorAll(".schedules-table tbody tr").length).toBeGreaterThan(0);
  });

  it("offers Configure when a role is missing", () => {
    const project = makeProject();
    lengthItem(project, { label: "Wall A" });
    store.setProject(project, null);
    const calls: Array<[string, string | undefined]> = [];
    const { container } = mountPanel({
      openTakeoffSettings: (tab, focusId) => {
        calls.push([tab, focusId]);
      },
    });
    const wallCard = container.querySelector(".schedules-card-wallLength")!;
    expect(wallCard.querySelector(".schedules-card-value")?.textContent).toBe("0");
    expect(wallCard.textContent).toContain("No category is set as a wall");
    const configure = wallCard.querySelector<HTMLButtonElement>(".schedules-card-configure");
    expect(configure).toBeTruthy();
    configure!.click();
    expect(calls).toEqual([["cards", "wallLength"]]);
  });

  it("switches to a stored schedule and navigates to a row", () => {
    const project = makeProject();
    const first = lengthItem(project, { label: "Wall A" });
    lengthItem(project, { label: "Wall B", page: 2 });
    schedule(project);
    store.setProject(project, null);
    const navigated: string[] = [];
    const { container } = mountPanel({
      navigateToItem: (pageId, layerId, itemId) => navigated.push(`${pageId}:${layerId}:${itemId}`),
    });

    const picker = labelled<HTMLSelectElement>("Takeoff table")!;
    expect(picker.dataset.summaryFocus).toBe("picker");
    setValue(picker, "sched_ui");
    expect(container.querySelector(".schedules-table thead th")?.textContent).toBe("Label");
    const links = [...container.querySelectorAll<HTMLButtonElement>(".schedules-row-link")];
    expect(links.map((link) => link.textContent)).toEqual(["Wall A", "Wall B"]);
    links[0].click();
    expect(navigated).toEqual([`${first.pageId}:${measureLayer(project).id}:${first.id}`]);
  });

  it("narrows the table with the page filter chip", () => {
    const project = makeProject();
    lengthItem(project, { label: "Wall A", page: 1 });
    lengthItem(project, { label: "Wall B", page: 2 });
    schedule(project);
    store.setProject(project, null);
    const { container } = mountPanel();
    setValue(labelled<HTMLSelectElement>("Takeoff table")!, "sched_ui");
    expect(container.querySelectorAll(".schedules-row-link")).toHaveLength(2);

    const pageChip = [
      ...container.querySelectorAll<HTMLSelectElement>(".schedules-chip-select"),
    ][0];
    expect(pageChip.dataset.summaryFocus).toBe("filter-page");
    setValue(pageChip, pageIdFor(2));
    expect(container.querySelectorAll(".schedules-row-link")).toHaveLength(1);
    expect(container.querySelector(".schedules-row-link")?.textContent).toBe("Wall B");

    button("Clear filters", container)?.click();
    expect(container.querySelectorAll(".schedules-row-link")).toHaveLength(2);
  });

  it("shows the empty state when nothing matches", () => {
    const project = makeProject();
    store.setProject(project, null);
    const { container } = mountPanel();
    expect(container.querySelector(".schedules-empty-title")?.textContent).toBe("No rows yet.");
    expect(button("New takeoff table…", container)).toBeTruthy();
  });

  it("labels the built-in table as a preview and offers both create actions", () => {
    const project = makeProject();
    lengthItem(project, { label: "Wall A" });
    store.setProject(project, null);
    const { container } = mountPanel();
    const picker = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    expect(picker.selectedOptions[0].textContent).toBe("Preview – cannot be placed");
    expect(container.querySelector(".schedules-preview-title")?.textContent).toBe(
      "Preview – cannot be placed",
    );
    const create = container.querySelector<HTMLButtonElement>(
      '[data-summary-focus="preview-create"]',
    )!;
    expect(create.textContent).toBe("Create takeoff table");
    const createPlace = container.querySelector<HTMLButtonElement>(
      '[data-summary-focus="preview-create-place"]',
    )!;
    expect(createPlace.textContent).toBe("Create takeoff table and place…");
    expect(project.schedules).toHaveLength(0);
  });

  it("states why the takeoff actions are disabled", () => {
    const project = makeProject();
    lengthItem(project, { label: "Wall A" });
    schedule(project);
    store.setProject(project, null);
    const { container, paint } = mountPanel({
      exportScheduleCsv: () => undefined,
      importScheduleCsv: () => undefined,
    });

    // A saved table exists, so the tab opens on the first one with live actions.
    const picker = container.querySelector<HTMLSelectElement>(".schedules-schedule-select")!;
    expect(picker.value).toBe("sched_ui");
    expect(container.querySelector(".schedules-action-reason")).toBeNull();
    // Choosing the built-in preview explicitly restores the disabled reason.
    setValue(picker, "");
    const reason = container.querySelector(".schedules-action-reason")!;
    const noTable = "Select a saved takeoff table to edit, place, export or import it.";
    expect(reason.textContent).toBe(noTable);
    const edit = container.querySelector<HTMLButtonElement>('[data-summary-focus="edit"]')!;
    expect(edit.disabled).toBe(true);
    expect(edit.title).toBe(noTable);
    expect(edit.getAttribute("aria-describedby")).toBe(reason.id);

    setValue(picker, "sched_ui");
    expect(container.querySelector(".schedules-action-reason")).toBeNull();
    const enabledEdit = container.querySelector<HTMLButtonElement>('[data-summary-focus="edit"]')!;
    expect(enabledEdit.disabled).toBe(false);
    expect(enabledEdit.hasAttribute("aria-describedby")).toBe(false);

    store.setReadOnly(true);
    paint();
    const readOnly = container.querySelector(".schedules-action-reason")!;
    const note = "The session is read-only, so editing, placing and importing are unavailable.";
    expect(readOnly.textContent).toBe(note);
    const place = container.querySelector<HTMLButtonElement>('[data-summary-focus="place"]')!;
    expect(place.disabled).toBe(true);
    expect(place.title).toBe(note);
    expect(place.getAttribute("aria-describedby")).toBe(readOnly.id);
    expect(container.querySelector<HTMLButtonElement>('[data-summary-focus="new"]')?.disabled).toBe(
      true,
    );
    expect(
      container.querySelector<HTMLButtonElement>('[data-summary-focus="export"]')?.disabled,
    ).toBe(false);
    store.setReadOnly(false);
  });

  it("excludes hidden items from a schedule table", () => {
    const project = makeProject();
    lengthItem(project, { label: "Visible" });
    const hiddenItem = lengthItem(project, { label: "Hidden" });
    hiddenItem.visible = false;
    const layer = addLayer(project, "measure", "Hidden layer");
    setLayerVisibleOnPage(layer, pageIdFor(1), false);
    const hidden: MarkupItem = {
      id: "item_hidden_layer",
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
      label: "Layered",
    };
    addItem(project, layer.id, hidden);
    schedule(project);
    store.setProject(project, null);
    const { container } = mountPanel();
    setValue(labelled<HTMLSelectElement>("Takeoff table")!, "sched_ui");
    const labels = [...container.querySelectorAll(".schedules-row-link")].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(["Visible"]);
  });
});

describe("schedule builder", () => {
  it("creates a schedule in one undo step", async () => {
    const project = makeProject();
    lengthItem(project, { label: "Wall A" });
    store.setProject(project, null);
    const done = openScheduleBuilder();
    const name = labelled<HTMLInputElement>("Name")!;
    setValue(name, "Doors and walls", "input");
    button("Save")!.click();
    expect(project.schedules).toHaveLength(1);
    expect(project.schedules[0].name).toBe("Doors and walls");
    expect(project.schedules[0].columns.length).toBeGreaterThan(0);
    // Saving keeps the window open, so the test closes it explicitly.
    expect(document.querySelector(".modal")).toBeTruthy();
    button("Close", document.querySelector(".modal")!)!.click();
    store.undo();
    expect(store.project!.schedules).toHaveLength(0);
    store.redo();
    expect(store.project!.schedules).toHaveLength(1);
    await done;
  });

  it("adds and reorders a column and shows the preview", () => {
    const project = makeProject();
    lengthItem(project, { label: "Wall A" });
    store.setProject(project, null);
    const done = openScheduleBuilder();
    expect(document.querySelector(".schedules-preview-table")).toBeTruthy();
    const picker = labelled<HTMLSelectElement>("Field to add")!;
    setValue(picker, "room");
    button("Add column")!.click();
    const rows = document.querySelectorAll(".schedules-builder-column");
    expect(rows.length).toBe(5);
    const moveUp = document.querySelector<HTMLButtonElement>(
      '.schedules-builder-column:nth-child(5) [aria-label="Move Room up"]',
    );
    expect(moveUp).toBeTruthy();
    moveUp!.click();
    const labels = [
      ...document.querySelectorAll<HTMLInputElement>(".schedules-builder-column-label"),
    ];
    expect(labels.map((input) => input.placeholder)).toContain("Room");
    button("Close", document.querySelector(".modal")!)?.click();
    void done;
  });

  it("reorders a column by pointer drag as well as the arrow buttons", () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openScheduleBuilder();
    const rows = [...document.querySelectorAll<HTMLElement>(".schedules-builder-column")];
    expect(rows.length).toBeGreaterThan(2);
    const labels = (): (string | null)[] =>
      [...document.querySelectorAll<HTMLInputElement>(".schedules-builder-column-label")].map(
        (input) => input.placeholder,
      );
    const before = labels();
    rows.forEach((row, index) => {
      row.getBoundingClientRect = () => rect(index * 30, 0, 300, 30);
    });
    const list = document.querySelector<HTMLElement>(".schedules-builder-columns")!;
    list.getBoundingClientRect = () => rect(0, 0, 300, rows.length * 30);
    const handle = rows[0].querySelector<HTMLElement>(".schedules-builder-handle")!;
    dragPointer({ target: handle, x: 10, y: 15 }, { x: 10, y: 75 });
    const after = labels();
    expect(after[2]).toBe(before[0]);
    expect(after.slice(0, 2)).toEqual(before.slice(1, 3));
    button("Close", document.querySelector(".modal")!)?.click();
    void done;
  });

  it("duplicates and deletes an existing schedule", async () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    const duplicateDone = openScheduleBuilder("sched_ui");
    button("Duplicate")!.click();
    expect(project.schedules).toHaveLength(2);
    expect(project.schedules[1].name).toContain("Walls");
    // Duplicating keeps the window open on the original draft.
    expect(document.querySelector(".modal")).toBeTruthy();
    button("Close", document.querySelector(".modal")!)!.click();
    await duplicateDone;

    const deleteDone = openScheduleBuilder("sched_ui");
    button("Delete")!.click();
    const confirm = document.querySelector<HTMLElement>(".inline-confirm");
    expect(confirm?.hidden).toBe(false);
    confirm!.querySelector<HTMLButtonElement>(".btn-danger")!.click();
    expect(project.schedules).toHaveLength(1);
    // A delete closes the builder because the table is gone.
    expect(document.querySelector(".modal")).toBeNull();
    await deleteDone;
  });

  it("refuses to save a schedule with no visible column", async () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openScheduleBuilder();
    for (const checkbox of document.querySelectorAll<HTMLInputElement>(
      ".schedules-builder-visible input",
    )) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    button("Save")!.click();
    expect(project.schedules).toHaveLength(0);
    expect(document.querySelector(".form-warning")?.textContent).toContain(
      "Add at least one visible column",
    );
    closeActiveModal();
    await done;
  });
});

describe("takeoff settings gear", () => {
  it("opens the hub from the panel toolbar", () => {
    const project = makeProject();
    store.setProject(project, null);
    const calls: Array<[string, string | undefined]> = [];
    const { container } = mountPanel({
      openTakeoffSettings: (tab, focusId) => {
        calls.push([tab, focusId]);
      },
    });
    const settings = container.querySelector<HTMLButtonElement>(".schedules-settings")!;
    expect(settings).toBeTruthy();
    settings.click();
    expect(calls).toEqual([["objects", undefined]]);
  });

  it("disables the gear in a view-only session", () => {
    const project = makeProject();
    store.setProject(project, null);
    store.setReadOnly(true);
    try {
      const { container } = mountPanel();
      const settings = container.querySelector<HTMLButtonElement>(".schedules-settings")!;
      expect(settings.disabled).toBe(true);
      expect(settings.title).toBe("Editing disabled (view-only)");
    } finally {
      store.setReadOnly(false);
    }
  });
});

describe("summary tab state", () => {
  it("toggles without touching the project", () => {
    const project = makeProject();
    store.setProject(project, null);
    expect(isSummaryOpen()).toBe(false);
    setSummaryOpen(true);
    expect(isSummaryOpen()).toBe(true);
    expect(project.schedules).toHaveLength(0);
  });
});
