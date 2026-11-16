// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildScheduleCsvImport,
  openScheduleCsvImport,
  renderSummaryPanel,
  serializeScheduleCsv,
  setSummarySelectedScheduleId,
  type ScheduleCsvImportPlan,
  type SummaryPanelHost,
} from "../src/features/schedules";
import { closeActiveModal } from "../src/ui/dialogs";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { FieldDefinition, Project, ScheduleDefinition } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

const NOTE_FIELD: FieldDefinition = {
  id: "field_note",
  key: "note",
  label: "Note",
  type: "text",
  scope: "measurement",
  order: 1,
};

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  project.fieldDefinitions.push({ ...NOTE_FIELD });
  return project;
}

function addWall(project: Project, id: string, label: string, note = "North wall"): void {
  addItem(project, layersForKind(project, "measure")[0].id, {
    id,
    pageId: pageIdFor(1),
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
    ],
    color: "#e30613",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    label,
    custom: { field_note: note },
  });
}

function schedule(
  project: Project,
  overrides: Partial<ScheduleDefinition> = {},
): ScheduleDefinition {
  const entry: ScheduleDefinition = {
    id: "sched_csv",
    name: "Walls",
    source: "measurements",
    rowMode: "items",
    columns: [
      { id: "c1", field: "label", visible: true },
      { id: "c2", field: "value", visible: true, format: "unit" },
      { id: "c3", field: "unit", visible: true },
      { id: "c4", field: "custom:field_note", visible: true },
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  project.schedules.push(entry);
  return entry;
}

function projectWithWalls(): Project {
  const project = makeProject();
  addWall(project, "item_a", "Wall A");
  addWall(project, "item_b", "Wall B", "South wall");
  schedule(project);
  return project;
}

function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function planFor(project: Project, edit?: (csv: string) => string): ScheduleCsvImportPlan {
  const csv = serializeScheduleCsv(project, "sched_csv", { locale: "en", format: "locale" })!;
  const text = edit ? edit(csv.text) : csv.text;
  return buildScheduleCsvImport(csvBytes(text), { project, scheduleId: "sched_csv" });
}

function button(label: string, root: ParentNode = document): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
}

function mountPanel(hostOverrides: Partial<SummaryPanelHost> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const host: SummaryPanelHost = {
    navigateToItem: () => undefined,
    goToPage: () => undefined,
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
  setSummarySelectedScheduleId(null);
});

afterEach(() => {
  closeActiveModal();
  document.body.replaceChildren();
});

describe("schedule CSV panel actions", () => {
  it("exports a stored schedule and opens the import for an items schedule", () => {
    const project = projectWithWalls();
    store.setProject(project, null);
    const exported: string[] = [];
    const imported: string[] = [];
    const { container, paint } = mountPanel({
      exportScheduleCsv: (id) => exported.push(id),
      importScheduleCsv: (id) => imported.push(id),
    });
    setSummarySelectedScheduleId("sched_csv");
    paint();
    button("Export CSV…", container)?.click();
    button("Import CSV…", container)?.click();
    expect(exported).toEqual(["sched_csv"]);
    expect(imported).toEqual(["sched_csv"]);
  });

  it("disables the import for a grouped schedule but keeps the export", () => {
    const project = projectWithWalls();
    schedule(project, {
      id: "sched_grouped",
      rowMode: "grouped",
      groupBy: "label",
      columns: [{ id: "g1", field: "label", visible: true }],
    });
    store.setProject(project, null);
    const { container, paint } = mountPanel({
      exportScheduleCsv: () => undefined,
      importScheduleCsv: () => undefined,
    });
    setSummarySelectedScheduleId("sched_grouped");
    paint();
    const exportButton = button("Export CSV…", container);
    const importButton = button("Import CSV…", container);
    expect(exportButton?.disabled).toBe(false);
    expect(importButton?.disabled).toBe(true);
    expect(importButton?.title).toContain("read-only");
  });

  it("disables the import in a view-only session", () => {
    const project = projectWithWalls();
    store.setProject(project, null, false);
    store.setReadOnly(true);
    const { container, paint } = mountPanel({
      exportScheduleCsv: () => undefined,
      importScheduleCsv: () => undefined,
    });
    setSummarySelectedScheduleId("sched_csv");
    paint();
    expect(button("Import CSV…", container)?.disabled).toBe(true);
    expect(button("Export CSV…", container)?.disabled).toBe(false);
    store.setReadOnly(false);
  });
});

describe("schedule CSV import dialog", () => {
  it("shows the dry run, applies one changed row and one undo step", async () => {
    const project = projectWithWalls();
    store.setProject(project, null);
    const plan = planFor(project, (csv) => csv.replace(",Wall A,", ",Wall A edited,"));
    expect(plan.changed).toHaveLength(1);
    let refreshed = 0;
    const done = openScheduleCsvImport(plan, { refresh: () => (refreshed += 1) });
    const dialog = document.querySelector(".modal");
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector(".schedules-csv-summary")?.textContent).toContain("1 changed");
    const rows = [...dialog!.querySelectorAll(".schedules-csv-table tbody tr")];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Wall A");
    expect(rows[0].textContent).toContain("Wall A edited");
    expect(button("Apply 1 changed row", dialog!)?.disabled).toBe(false);
    button("Apply 1 changed row", dialog!)?.click();
    await done;
    expect(refreshed).toBe(1);
    const item = store
      .project!.layers.flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_a")!;
    expect(item.label).toBe("Wall A edited");
    expect(store.canUndo).toBe(true);
    store.undo();
    const restored = store
      .project!.layers.flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_a")!;
    expect(restored.label).toBe("Wall A");
  });

  it("offers no apply action when the file is unchanged", async () => {
    const project = projectWithWalls();
    store.setProject(project, null);
    const plan = planFor(project);
    expect(plan.changed).toHaveLength(0);
    const done = openScheduleCsvImport(plan);
    const dialog = document.querySelector(".modal")!;
    expect(dialog.textContent).toContain("No changed rows");
    const primary = dialog.querySelector<HTMLButtonElement>(".modal-footer .btn-primary")!;
    expect(primary.disabled).toBe(true);
    button("Cancel", dialog)?.click();
    await done;
    expect(store.canUndo).toBe(false);
  });

  it("reports unknown fields, read-only columns and rejected rows", async () => {
    const project = projectWithWalls();
    store.setProject(project, null);
    const text = [
      "ID,Typ,Label [label],Value [value],Mystery [mystery]",
      "item_a,item,Wall A2,1,x",
      "item_missing,item,Missing,,",
      "item_b,item,Wall B,,,extra",
    ].join("\r\n");
    const plan = buildScheduleCsvImport(csvBytes(text), { project, scheduleId: "sched_csv" });
    const done = openScheduleCsvImport(plan);
    const dialog = document.querySelector(".modal")!;
    expect(dialog.textContent).toContain("Unknown fields");
    expect(dialog.textContent).toContain("Read-only columns");
    expect(dialog.textContent).toContain("Unknown IDs");
    expect(dialog.textContent).toContain("item_missing");
    expect(dialog.textContent).toContain("more cells");
    button("Cancel", dialog)?.click();
    await done;
  });

  it("refuses to apply a preview after the project changed", async () => {
    const project = projectWithWalls();
    store.setProject(project, null);
    const plan = planFor(project, (csv) => csv.replace(",Wall A,", ",Wall A edited,"));
    const done = openScheduleCsvImport(plan);
    const dialog = document.querySelector(".modal")!;
    store.mutate((target) => {
      target.name = "Changed elsewhere";
    });
    button("Apply 1 changed row", dialog)?.click();
    await done;
    const item = store
      .project!.layers.flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_a")!;
    expect(item.label).toBe("Wall A");
  });

  it("renders a cell value as text, never as markup", async () => {
    const project = projectWithWalls();
    store.setProject(project, null);
    const malicious = "<img src=x onerror=alert(1)>";
    const plan = planFor(project, (csv) => csv.replace(",North wall", `,${malicious}`));
    expect(plan.changed).toHaveLength(1);
    const done = openScheduleCsvImport(plan);
    const dialog = document.querySelector(".modal")!;
    expect(dialog.querySelector(".schedules-csv-table img")).toBeNull();
    expect(dialog.querySelector(".schedules-csv-table")?.textContent).toContain(malicious);
    button("Cancel", dialog)?.click();
    await done;
  });

  it("refuses an over-limit planned file with a clear message and no apply", async () => {
    const project = projectWithWalls();
    store.setProject(project, null);
    const plan = planFor(project);
    const blocked: ScheduleCsvImportPlan = { ...plan, blocked: "tooManyRows", totalRows: 20_001 };
    const done = openScheduleCsvImport(blocked);
    const dialog = document.querySelector(".modal")!;
    expect(dialog.textContent).toContain("limit");
    expect(dialog.querySelector(".modal-footer .btn-primary")?.textContent).toBe("Close");
    button("Close", dialog)?.click();
    await done;
  });
});
