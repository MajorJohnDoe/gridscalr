// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openScheduleBuilder } from "../src/features/schedules";
import { closeActiveModal } from "../src/ui/dialogs";
import { t } from "../src/i18n";
import { createProject, defaultDocument } from "../src/model/layers";
import type { Project, ScheduleDefinition } from "../src/model/types";
import { store } from "../src/state/store";
import { withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  project.settings.lengthUnit = "m";
  project.settings.areaUnit = "m2";
  return project;
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
    ],
    filters: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  project.schedules.push(entry);
  return entry;
}

function modal(): HTMLElement {
  const node = document.querySelector<HTMLElement>(".modal");
  if (!node) throw new Error("no dialog is open");
  return node;
}

function headerAction(label: string): HTMLButtonElement {
  const node = modal().querySelector<HTMLButtonElement>(
    `.modal-header-actions [aria-label="${label}"]`,
  );
  if (!node) throw new Error(`missing header action ${label}`);
  return node;
}

function nameInput(): HTMLInputElement {
  const node = modal().querySelector<HTMLInputElement>(".schedules-builder-name");
  if (!node) throw new Error("missing name field");
  return node;
}

function toastText(): string {
  return document.querySelector(".toast-stack")?.textContent?.trim() ?? "";
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

afterEach(() => {
  closeActiveModal();
  document.querySelectorAll(".dialog-layer").forEach((node) => node.remove());
  // The toast module keeps its stack element; keep it attached and empty so a
  // later test's toast is visible instead of appending to a detached node.
  for (const child of [...document.body.children]) {
    if (child.classList.contains("toast-stack")) child.replaceChildren();
    else child.remove();
  }
  store.setReadOnly(false);
  store.closeProject();
});

beforeEach(() => {
  store.closeProject();
});

describe("takeoff table editor header actions", () => {
  it("shows Save, Duplicate and Delete beside Close in the header order", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");

    const header = modal().querySelector<HTMLElement>(".modal-header")!;
    const labels = [...header.querySelectorAll<HTMLButtonElement>("button")].map((entry) =>
      entry.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Save", "Duplicate", "Delete", "Close"]);

    const actions = header.querySelector<HTMLElement>(".modal-header-actions")!;
    expect(actions.children).toHaveLength(3);
    expect((actions.children[0] as HTMLElement).getAttribute("aria-label")).toBe("Save");
    expect((actions.children[1] as HTMLElement).getAttribute("aria-label")).toBe("Duplicate");
    expect((actions.children[2] as HTMLElement).getAttribute("aria-label")).toBe("Delete");
    expect(header.lastElementChild?.classList.contains("modal-close")).toBe(true);

    for (const label of ["Save", "Duplicate", "Delete"]) {
      const action = headerAction(label);
      // The tooltip repeats the accessible name, which is what a narrow header
      // shows once the visible label is hidden.
      expect(action.title).toBe(label);
      expect(action.textContent?.trim()).toBe(label);
    }
  });

  it("leaves no second action row in the dialog body", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");

    expect(document.querySelector(".schedules-builder-actions")).toBeNull();
    const body = modal().querySelector<HTMLElement>(".modal-body")!;
    for (const label of ["Save", "Duplicate", "Delete"]) {
      expect(body.querySelector(`[aria-label="${label}"]`)).toBeNull();
    }
    expect(
      [...body.querySelectorAll("button")].map((entry) => entry.textContent?.trim()),
    ).not.toContain("Save");
    const footer = modal().querySelector<HTMLElement>(".modal-footer")!;
    expect(
      [...footer.querySelectorAll("button")].map((entry) => entry.textContent?.trim()),
    ).toEqual(["Close"]);
  });

  it("keeps the header actions in the tab order and the name field as initial focus", async () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");
    await nextFrame();

    for (const label of ["Save", "Duplicate", "Delete"]) {
      const action = headerAction(label);
      expect(action.disabled).toBe(false);
      expect(action.tabIndex).toBe(0);
    }
    expect(document.activeElement).toBe(nameInput());
    // The actions precede the body fields, so Tab reaches them first.
    const firstField = modal().querySelector<HTMLElement>(".modal-body input")!;
    expect(
      headerAction("Save").compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("saves from the header in one undo step and keeps the window open", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");

    nameInput().value = "Walls and doors";
    nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    headerAction("Save").click();

    expect(store.project!.schedules[0].name).toBe("Walls and doors");
    // The window stays open on the same draft: the drawing behind it is the
    // reason the builder is non-modal.
    expect(document.querySelector(".modal")).toBeTruthy();
    expect(nameInput().value).toBe("Walls and doors");
    expect(toastText()).toContain("Walls and doors");
    store.undo();
    expect(store.project!.schedules[0].name).toBe("Walls");
    expect(store.canUndo).toBe(false);
  });

  it("keeps a new table open, adopts its id and updates it on the next save", () => {
    const project = makeProject();
    store.setProject(project, null);
    void openScheduleBuilder();

    expect(headerAction("Delete").disabled).toBe(true);
    nameInput().value = "First table";
    nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    headerAction("Save").click();

    expect(store.project!.schedules.map((entry) => entry.name)).toEqual(["First table"]);
    expect(document.querySelector(".modal")).toBeTruthy();
    // The header now names the saved window and Delete has an identity.
    expect(modal().querySelector(".modal-titles h2")?.textContent).toBe("Edit takeoff table");
    expect(headerAction("Delete").disabled).toBe(false);

    nameInput().value = "Second name";
    nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    headerAction("Save").click();

    // A second save updates the same table instead of creating a second one.
    expect(store.project!.schedules).toHaveLength(1);
    expect(store.project!.schedules[0].name).toBe("Second name");
    expect(document.querySelector(".modal")).toBeTruthy();

    store.undo();
    expect(store.project!.schedules[0].name).toBe("First table");
    store.undo();
    expect(store.project!.schedules).toHaveLength(0);
  });

  it("shows the stored name when the model had to make it unique", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder();

    nameInput().value = "Walls";
    nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    headerAction("Save").click();

    expect(store.project!.schedules.map((entry) => entry.name)).toEqual(["Walls", "Walls (2)"]);
    // The field and the next update use the name the project actually holds.
    expect(nameInput().value).toBe("Walls (2)");
    headerAction("Save").click();
    expect(store.project!.schedules.map((entry) => entry.name)).toEqual(["Walls", "Walls (2)"]);
  });

  it("reports a table that disappeared behind the open window and writes nothing", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");

    store.mutate((current) => {
      current.schedules = [];
    }, "change");
    headerAction("Save").click();

    expect(store.project!.schedules).toHaveLength(0);
    expect(document.querySelector(".modal")).toBeTruthy();
    expect(document.querySelector(".schedules-builder-problems")?.textContent).toBe(
      t("schedules.problem.unknownSchedule"),
    );
  });

  it("refuses an empty name from the header without writing anything", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");

    nameInput().value = "";
    nameInput().dispatchEvent(new Event("input", { bubbles: true }));
    headerAction("Save").click();

    expect(store.project!.schedules[0].name).toBe("Walls");
    expect(store.canUndo).toBe(false);
    expect(document.querySelector(".modal")).toBeTruthy();
    expect(nameInput().value).toBe("");
    expect(document.querySelector(".form-warning")?.textContent).toBe(
      t("schedules.problem.missingName"),
    );
    expect(document.activeElement).toBe(nameInput());
  });

  it("duplicates from the header in one undo step and stays on the original", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");

    headerAction("Duplicate").click();

    expect(store.project!.schedules.map((entry) => entry.name)).toEqual(["Walls", "Walls copy"]);
    // The editor keeps editing the original, so one undo removes exactly the
    // copy and never leaves the open draft pointing at a deleted table.
    expect(document.querySelector(".modal")).toBeTruthy();
    expect(nameInput().value).toBe("Walls");

    headerAction("Duplicate").click();
    expect(store.project!.schedules.map((entry) => entry.name)).toEqual([
      "Walls",
      "Walls copy",
      "Walls copy (2)",
    ]);
    store.undo();
    expect(store.project!.schedules.map((entry) => entry.name)).toEqual(["Walls", "Walls copy"]);
    expect(document.querySelector(".modal")).toBeTruthy();
    store.undo();
    expect(store.project!.schedules).toHaveLength(1);
  });

  it("confirms a delete from a strip under the header and writes one undo step", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");

    headerAction("Delete").click();
    const confirm = modal().querySelector<HTMLElement>(".inline-confirm")!;
    expect(confirm.hidden).toBe(false);
    // The confirmation must not scroll away with the body.
    expect(modal().querySelector(".modal-body")!.contains(confirm)).toBe(false);
    expect(confirm.previousElementSibling?.classList.contains("modal-header")).toBe(true);
    expect(confirm.textContent).toContain("Walls");

    confirm.querySelector<HTMLButtonElement>(".btn-danger")!.click();
    expect(store.project!.schedules).toHaveLength(0);
    expect(document.querySelector(".modal")).toBeNull();
    store.undo();
    expect(store.project!.schedules).toHaveLength(1);
  });

  it("keeps every header action disabled in a read-only session", () => {
    const project = makeProject();
    schedule(project);
    store.setProject(project, null);
    store.setReadOnly(true);
    void openScheduleBuilder("sched_ui");

    for (const label of ["Save", "Duplicate", "Delete"]) {
      expect(headerAction(label).disabled).toBe(true);
    }
    headerAction("Save").click();
    headerAction("Duplicate").click();
    expect(store.project!.schedules).toHaveLength(1);
    expect(store.canUndo).toBe(false);
    expect(document.querySelector(".modal")).toBeTruthy();
  });

  it("disables Delete while a new table has no identity yet", () => {
    const project = makeProject();
    store.setProject(project, null);
    store.setReadOnly(false);
    void openScheduleBuilder();

    expect(headerAction("Save").disabled).toBe(false);
    expect(headerAction("Duplicate").disabled).toBe(false);
    expect(headerAction("Delete").disabled).toBe(true);
  });

  it("refuses the delete when the table is removed behind the confirmation", () => {
    const project = makeProject();
    schedule(project);
    schedule(project, { id: "sched_other", name: "Other" });
    store.setProject(project, null);
    void openScheduleBuilder("sched_ui");

    headerAction("Delete").click();
    store.mutate((current) => {
      current.schedules = current.schedules.filter((entry) => entry.id !== "sched_ui");
    }, "change");
    const confirm = modal().querySelector<HTMLElement>(".inline-confirm")!;
    confirm.querySelector<HTMLButtonElement>(".btn-danger")!.click();

    expect(store.project!.schedules.map((entry) => entry.id)).toEqual(["sched_other"]);
    expect(confirm.hidden).toBe(true);
    expect(toastText()).toContain("Walls");
    expect(toastText()).toContain("no longer exists");
  });
});
