// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  appendFieldsSection,
  createField,
  createFieldSet,
  emptyFieldDraft,
  emptyFieldSetDraft,
  openFieldsDialog,
} from "../src/features/fields";
import type { FieldDraft, FieldSetDraft } from "../src/features/fields";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
}

function measurement(project: Project, overrides: Partial<MarkupItem> = {}): MarkupItem {
  const item: MarkupItem = {
    id: `item_${Math.random().toString(36).slice(2)}`,
    pageId: pageIdFor(1),
    kind: "area",
    points: [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
    ],
    color: "#f70808",
    strokeWidth: 2,
    categoryId: project.categories[0].id,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  addItem(project, layersForKind(project, "measure")[0].id, item);
  return item;
}

function draft(overrides: Partial<FieldDraft> = {}): FieldDraft {
  return { ...emptyFieldDraft(), key: "fireClass", label: "Fire class", ...overrides };
}

function addField(project: Project, overrides: Partial<FieldDraft> = {}) {
  const result = createField(project, draft(overrides), `field_${project.fieldDefinitions.length}`);
  expect(result.problems).toEqual([]);
  return result.field!;
}

function setDraft(overrides: Partial<FieldSetDraft> = {}): FieldSetDraft {
  return { ...emptyFieldSetDraft(), ...overrides };
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

afterEach(() => {
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
});

describe("custom field editor", () => {
  it("creates a field from the dialog and keeps the dialog open", async () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openFieldsDialog();

    button("Add field")?.click();
    const label = labelled<HTMLInputElement>("Label");
    const key = labelled<HTMLInputElement>("Key");
    expect(label).not.toBeNull();
    expect(key).not.toBeNull();
    setValue(label!, "Fire class");
    setValue(key!, "fireClass");
    button("Save field")?.click();

    expect(project.fieldDefinitions).toHaveLength(1);
    expect(project.fieldDefinitions[0]).toMatchObject({
      key: "fireClass",
      label: "Fire class",
      type: "text",
      scope: "measurement",
    });
    expect(document.body.textContent).toContain("Fire class");
    // The dialog is still open after a save.
    expect(document.querySelector(".modal")).not.toBeNull();
    button("Close")?.click();
    await done;
  });

  it("creates an enum field with an option from the same form", async () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openFieldsDialog();
    button("Add field")?.click();
    setValue(labelled<HTMLInputElement>("Label")!, "Fire class");
    setValue(labelled<HTMLInputElement>("Key")!, "fireClass");
    setValue(labelled<HTMLSelectElement>("Type")!, "enum");

    button("Add option")?.click();
    const optionInput = document.querySelector<HTMLInputElement>(
      'input[aria-label^="Label for option"]',
    );
    expect(optionInput).not.toBeNull();
    setValue(optionInput!, "EI30");
    button("Save field")?.click();

    expect(project.fieldDefinitions).toHaveLength(1);
    expect(project.fieldDefinitions[0].type).toBe("enum");
    expect(project.fieldDefinitions[0].options).toHaveLength(1);
    expect(project.fieldDefinitions[0].options?.[0].label).toBe("EI30");
    button("Close")?.click();
    await done;
  });

  it("shows an inline error and creates nothing when the key is missing", async () => {
    const project = makeProject();
    store.setProject(project, null);
    const done = openFieldsDialog();
    button("Add field")?.click();
    setValue(labelled<HTMLInputElement>("Label")!, "Fire class");
    button("Save field")?.click();

    expect(project.fieldDefinitions).toEqual([]);
    expect(document.querySelector(".form-error:not([hidden])")?.textContent).toContain(
      "Enter a key",
    );
    button("Close")?.click();
    await done;
  });

  it("blocks a type change while values exist and names the count", async () => {
    const project = makeProject();
    const field = addField(project);
    measurement(project, { custom: { [field.id]: "EI30" } });
    store.setProject(project, null);
    const done = openFieldsDialog();

    button("Edit")?.click();
    const type = labelled<HTMLSelectElement>("Type")!;
    setValue(type, "number");

    // The change is refused at the control, before anything is saved.
    expect(type.value).toBe("text");
    expect(project.fieldDefinitions[0].type).toBe("text");
    expect(document.querySelector(".form-error:not([hidden])")?.textContent).toContain(
      "1 stored values",
    );
    button("Cancel")?.click();
    button("Close")?.click();
    await done;
  });

  it("confirms a deletion with the value count and removes the values", async () => {
    const project = makeProject();
    const field = addField(project);
    const item = measurement(project, { custom: { [field.id]: "EI30" } });
    const set = createFieldSet(
      project,
      setDraft({ name: "Fire", fieldIds: [field.id] }),
      "fset_1",
    ).set!;
    store.setProject(project, null);
    const done = openFieldsDialog();

    button("Delete field Fire class")?.click();
    expect(document.querySelector(".inline-confirm-text")?.textContent).toContain(
      "1 stored values",
    );
    const confirm = document.querySelector<HTMLButtonElement>(".inline-confirm .btn-danger");
    confirm?.click();

    expect(project.fieldDefinitions).toEqual([]);
    expect(item.custom).toBeUndefined();
    expect(project.fieldSets.find((entry) => entry.id === set.id)?.fieldIds).toEqual([]);
    button("Close")?.click();
    await done;
  });

  it("creates a field set from the dialog", async () => {
    const project = makeProject();
    addField(project, { label: "Fire class" });
    store.setProject(project, null);
    const done = openFieldsDialog();

    button("Add field set")?.click();
    setValue(labelled<HTMLInputElement>("Name")!, "Fire data");
    const check =
      labelled<HTMLInputElement>(
        "Fields in this set",
      )?.parentElement?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(check).not.toBeNull();
    check!.checked = true;
    check!.dispatchEvent(new Event("change"));
    button("Save field set")?.click();

    expect(project.fieldSets).toHaveLength(1);
    expect(project.fieldSets[0]).toMatchObject({ name: "Fire data", scope: "measurement" });
    expect(project.fieldSets[0].fieldIds).toEqual([project.fieldDefinitions[0].id]);
    button("Close")?.click();
    await done;
  });
});

describe("fields inspector section", () => {
  it("writes a typed value and clears it again", () => {
    const project = makeProject();
    const field = addField(project);
    const item = measurement(project);
    store.setProject(project, null);

    const section = document.createElement("section");
    appendFieldsSection(section, { project, item, locked: false });
    const input = labelled<HTMLInputElement>("Fire class", section);
    expect(input).not.toBeNull();
    setValue(input!, "  EI30 ");
    expect(item.custom?.[field.id]).toBe("EI30");
    expect(item.updatedAt).not.toBe(NOW);

    // A re-render reflects the saved value.
    const cleared = document.createElement("section");
    appendFieldsSection(cleared, { project, item, locked: false });
    button("Clear Fire class", cleared)?.click();
    expect(item.custom).toBeUndefined();
  });

  it("reports invalid input inline and stores nothing", () => {
    const project = makeProject();
    addField(project, { type: "number", min: "1", max: "10" });
    const item = measurement(project);
    store.setProject(project, null);

    const section = document.createElement("section");
    appendFieldsSection(section, { project, item, locked: false });
    const input = labelled<HTMLInputElement>("Fire class", section)!;
    setValue(input, "99");

    expect(item.custom).toBeUndefined();
    const error = section.querySelector(".form-error:not([hidden])");
    expect(error?.textContent).toContain("10 or less");
    expect(error?.hasAttribute("hidden")).toBe(false);
  });

  it("keeps saving unrelated fields when one field is invalid", () => {
    const project = makeProject();
    const number = addField(project, { key: "rating", label: "Rating", type: "number", max: "10" });
    const text = addField(project, { key: "note", label: "Note" });
    const item = measurement(project);
    store.setProject(project, null);

    const section = document.createElement("section");
    appendFieldsSection(section, { project, item, locked: false });
    setValue(labelled<HTMLInputElement>("Rating", section)!, "99");
    expect(item.custom?.[number.id]).toBeUndefined();

    // The invalid field is reported and the other field saves normally.
    setValue(labelled<HTMLInputElement>("Note", section)!, "Check annually");
    expect(item.custom?.[text.id]).toBe("Check annually");
    expect(item.custom?.[number.id]).toBeUndefined();
    expect(section.querySelector(".form-error:not([hidden])")?.textContent).toContain("10 or less");
  });

  it("reports, rather than rewrites, a stored value that does not match", () => {
    const project = makeProject();
    const field = addField(project, { type: "number" });
    const item = measurement(project, { custom: { [field.id]: "not a number" } });
    store.setProject(project, null);

    const section = document.createElement("section");
    appendFieldsSection(section, { project, item, locked: false });
    expect(section.querySelector(".form-error:not([hidden])")?.textContent).toContain(
      "does not match",
    );
    expect(item.custom?.[field.id]).toBe("not a number");
  });

  it("disables the controls for a locked measurement", () => {
    const project = makeProject();
    addField(project);
    const item = measurement(project);
    store.setProject(project, null);

    const section = document.createElement("section");
    appendFieldsSection(section, { project, item, locked: true });
    expect(labelled<HTMLInputElement>("Fire class", section)?.disabled).toBe(true);
  });

  it("explains the empty state and offers the editor", () => {
    const project = makeProject();
    const item = measurement(project);
    store.setProject(project, null);

    const section = document.createElement("section");
    appendFieldsSection(section, { project, item, locked: false });
    expect(section.textContent).toContain("No custom fields apply to this measurement.");
    expect(button("Manage fields…", section)).toBeDefined();
  });

  it("fills defaults from a field set on the selected measurement", () => {
    const project = makeProject();
    const field = addField(project, { defaultRaw: "EI30" });
    const item = measurement(project);
    createFieldSet(project, setDraft({ name: "Fire", fieldIds: [field.id] }), "fset_1");
    store.setProject(project, null);

    const section = document.createElement("section");
    appendFieldsSection(section, { project, item, locked: false });
    button("Apply field set", section)?.click();
    expect(item.custom?.[field.id]).toBe("EI30");
  });

  it("does not add a section for a drawing item", () => {
    const project = makeProject();
    addField(project);
    const item = measurement(project, { kind: "text" });
    store.setProject(project, null);

    const section = document.createElement("section");
    appendFieldsSection(section, { project, item, locked: false });
    expect(section.children).toHaveLength(0);
  });
});
