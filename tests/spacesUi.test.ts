// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { openSpacesDialog } from "../src/features/spaces";
import { createField as createCustomField, emptyFieldDraft } from "../src/features/fields";
import {
  addItem,
  createProject,
  defaultDocument,
  layersForKind,
  setLayerVisibleOnPage,
} from "../src/model/layers";
import { addLayer } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };

function makeProject(pages = 1): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", pages)));
}

function measureLayer(project: Project) {
  return layersForKind(project, "measure")[0];
}

function areaItem(
  project: Project,
  options: { room?: string; size?: number; subtract?: boolean; layerId?: string } = {},
): MarkupItem {
  const size = options.size ?? 100;
  const item: MarkupItem = {
    id: `item_${Math.random().toString(36).slice(2)}`,
    pageId: pageIdFor(1),
    kind: "area",
    points: [
      { x: 10, y: 10 },
      { x: 10 + size, y: 10 },
      { x: 10 + size, y: 10 + size },
      { x: 10, y: 10 + size },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    scale: { ...SCALE },
    createdAt: NOW,
    updatedAt: NOW,
    ...(options.room ? { room: options.room } : {}),
    ...(options.subtract ? { areaMode: "subtract" as const } : {}),
  };
  addItem(project, options.layerId ?? measureLayer(project).id, item);
  return item;
}

function button(label: string, root: ParentNode = document): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  );
}

function labelled<T extends HTMLElement>(label: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(`[aria-label="${label}"]`);
}

function setValue(input: HTMLInputElement | HTMLSelectElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change"));
}

function rowFor(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(".space-row")].find(
    (row) => row.querySelector(".space-name")?.textContent === name,
  );
}

afterEach(() => {
  document.querySelectorAll(".dialog-layer").forEach((node) => node.remove());
  document.body.replaceChildren();
  store.closeProject();
});

describe("space register", () => {
  it("shows an empty state and disables room creation without room text", async () => {
    const project = makeProject();
    areaItem(project);
    store.setProject(project, null);
    const done = openSpacesDialog();

    expect(document.body.textContent).toContain("No spaces yet");
    const fromText = button("Create rooms from the room text");
    expect(fromText?.disabled).toBe(true);
    button("Close")?.click();
    await done;
  });

  it("rebuilds the selection hint while the register stays open", async () => {
    const project = makeProject();
    const item = areaItem(project);
    store.setProject(project, null);
    const done = openSpacesDialog();

    expect(document.body.textContent).toContain(
      "Select an area measurement on the drawing to link it from a space.",
    );
    store.setSelection({ layerId: measureLayer(project).id, itemId: item.id });
    expect(document.body.textContent).toContain("1 area measurement is selected.");

    button("Close")?.click();
    await done;
  });

  it("creates a space from the form and lists it with a missing-area warning", async () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openSpacesDialog();

    button("New space")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "Kitchen");
    setValue(labelled<HTMLInputElement>("Room number")!, "101");
    button("Save space")?.click();

    expect(project.spaces).toHaveLength(1);
    expect(project.spaces[0]).toMatchObject({
      name: "Kitchen",
      number: "101",
      kind: "building",
      areaMode: "measured",
    });
    const row = rowFor("Kitchen");
    expect(row).toBeDefined();
    expect(row?.textContent).toContain("Missing");
    expect(row?.textContent).toContain("No area measurement is linked");
    button("Close")?.click();
    await done;
  });

  it("shows an inline error and creates nothing when the name is empty", async () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openSpacesDialog();

    button("New space")?.click();
    button("Save space")?.click();

    expect(project.spaces).toEqual([]);
    expect(document.querySelector(".form-error:not([hidden])")?.textContent).toContain(
      "A name is required",
    );
    button("Cancel")?.click();
    button("Close")?.click();
    await done;
  });

  it("creates rooms from the room text without linking a measurement", async () => {
    const project = makeProject();
    const kitchen = areaItem(project, { room: "Kitchen" });
    areaItem(project, { room: "Kitchen" });
    areaItem(project, { room: "Hall" });
    store.setProject(project, null);
    const done = openSpacesDialog();

    expect(document.body.textContent).toContain("2 room names");
    button("Create rooms from the room text")?.click();

    expect(project.spaces.map((space) => space.name).sort()).toEqual(["Hall", "Kitchen"]);
    expect(kitchen.spaceId).toBeUndefined();
    expect(project.spaces.every((space) => space.areaMode === "measured")).toBe(true);
    expect(rowFor("Kitchen")).toBeDefined();
    button("Close")?.click();
    await done;
  });

  it("links the selected measurement and shows the derived area", async () => {
    const project = makeProject();
    const item = areaItem(project);
    store.setProject(project, null);
    const done = openSpacesDialog();

    button("New space")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "Kitchen");
    button("Save space")?.click();
    store.setSelection({ layerId: measureLayer(project).id, itemId: item.id });

    // Reopen the list so it reads the new selection.
    button("Edit Kitchen")?.click();
    button("Cancel")?.click();

    const link = button("Link the selected measurements to Kitchen");
    expect(link?.disabled).toBe(false);
    link?.click();

    const linked = store.project?.layers.flatMap((layer) => layer.items)[0];
    expect(linked?.spaceId).toBe(project.spaces[0].id);
    const row = rowFor("Kitchen");
    expect(row?.textContent).toContain("Measured");
    expect(row?.textContent).toContain("1 m²");
    button("Close")?.click();
    await done;
  });

  it("excludes a hidden-layer measurement from the area and says so", async () => {
    const project = makeProject();
    const hidden = addLayer(project, "measure", "Hidden");
    setLayerVisibleOnPage(hidden, pageIdFor(1), false);
    const item = areaItem(project, { layerId: hidden.id });
    store.setProject(project, null);
    const done = openSpacesDialog();

    button("New space")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "Kitchen");
    button("Save space")?.click();

    store.setSelection({ layerId: hidden.id, itemId: item.id });
    button("Edit Kitchen")?.click();
    button("Cancel")?.click();
    button("Link the selected measurements to Kitchen")?.click();

    // Linking is allowed; the hidden measurement is simply not part of the area.
    expect(store.project?.spaces[0].id).toBeDefined();
    expect(project.layers.find((layer) => layer.id === hidden.id)?.items[0].spaceId).toBe(
      project.spaces[0].id,
    );
    const row = rowFor("Kitchen");
    expect(row?.textContent).toContain("Missing");
    expect(row?.textContent).toContain("Every linked measurement is hidden");
    button("Close")?.click();
    await done;
  });

  it("unlinks the selected measurement in one undo step", async () => {
    const project = makeProject();
    const item = areaItem(project);
    store.setProject(project, null);
    const done = openSpacesDialog();

    button("New space")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "Kitchen");
    button("Save space")?.click();
    store.setSelection({ layerId: measureLayer(project).id, itemId: item.id });
    button("Edit Kitchen")?.click();
    button("Cancel")?.click();
    button("Link the selected measurements to Kitchen")?.click();
    expect(store.project?.layers.flatMap((layer) => layer.items)[0].spaceId).toBeDefined();

    button("Unlink the selected measurements from Kitchen")?.click();
    expect(store.project?.layers.flatMap((layer) => layer.items)[0].spaceId).toBeUndefined();
    expect(store.project?.spaces).toHaveLength(1);
    expect(rowFor("Kitchen")?.textContent).toContain("Missing");
    button("Close")?.click();
    await done;
  });

  it("confirms a deletion with the link count and keeps the measurement", async () => {
    const project = makeProject();
    const item = areaItem(project);
    store.setProject(project, null);
    const done = openSpacesDialog();

    button("New space")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "Kitchen");
    button("Save space")?.click();
    store.setSelection({ layerId: measureLayer(project).id, itemId: item.id });
    button("Edit Kitchen")?.click();
    button("Cancel")?.click();
    button("Link the selected measurements to Kitchen")?.click();

    button("Delete Kitchen")?.click();
    expect(document.querySelector(".inline-confirm-text")?.textContent).toContain(
      "1 linked measurement is unlinked",
    );
    document.querySelector<HTMLButtonElement>(".inline-confirm .btn-danger")?.click();

    expect(project.spaces).toEqual([]);
    const items = project.layers.flatMap((layer) => layer.items);
    expect(items).toHaveLength(1);
    expect(items[0].spaceId).toBeUndefined();
    expect(store.canUndo).toBe(true);
    button("Close")?.click();
    await done;
  });

  it("blocks deleting a space that still has children", async () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openSpacesDialog();

    button("New space")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "House");
    setValue(labelled<HTMLSelectElement>("Type")!, "building");
    button("Save space")?.click();

    button("New space")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "Ground");
    setValue(labelled<HTMLSelectElement>("Type")!, "floor");
    const parent = labelled<HTMLSelectElement>("Parent")!;
    setValue(parent, project.spaces[0].id);
    button("Save space")?.click();
    expect(project.spaces).toHaveLength(2);

    button("Delete House")?.click();
    expect(document.querySelector(".inline-confirm-text")?.textContent).toContain("child spaces");
    expect(document.querySelector(".inline-confirm .btn-danger")).toBeNull();
    document.querySelector<HTMLButtonElement>(".inline-confirm .btn-ghost")?.click();
    expect(project.spaces).toHaveLength(2);
    button("Close")?.click();
    await done;
  });

  it("edits space-scope custom values in the space form", async () => {
    const project = makeProject();
    const field = createCustomField(
      project,
      { ...emptyFieldDraft("space"), key: "fireClass", label: "Fire class" },
      "field_space",
    ).field!;
    store.setProject(project, null);
    const done = openSpacesDialog();

    button("New space")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "Kitchen");
    setValue(labelled<HTMLInputElement>("Fire class")!, "EI30");
    button("Save space")?.click();

    expect(project.spaces[0].custom).toEqual({ [field.id]: "EI30" });
    button("Edit Kitchen")?.click();
    expect(labelled<HTMLInputElement>("Fire class")?.value).toBe("EI30");
    button("Cancel")?.click();
    button("Close")?.click();
    await done;
  });

  it("marks a duplicate room number as a warning without blocking the save", async () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openSpacesDialog();

    for (const name of ["Kitchen", "Store"]) {
      button("New space")?.click();
      setValue(labelled<HTMLInputElement>("Name")!, name);
      setValue(labelled<HTMLInputElement>("Room number")!, "101");
      button("Save space")?.click();
    }

    expect(project.spaces).toHaveLength(2);
    expect(rowFor("Kitchen")?.textContent).toContain("Room number 101 is also used");
    button("Close")?.click();
    await done;
  });
});
