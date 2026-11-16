import { describe, expect, it } from "vitest";
import {
  applicableFields,
  applyFieldSet,
  coerceFieldInput,
  createField,
  createFieldSet,
  customFieldRef,
  customValueText,
  deleteField,
  deleteFieldSet,
  emptyFieldDraft,
  emptyFieldSetDraft,
  enumOptionValueCount,
  fieldAppliesToItem,
  fieldDraftFor,
  fieldSetDefaultCount,
  fieldSetFields,
  fieldValueCount,
  fieldsForScope,
  moveField,
  storedValueProblem,
  updateField,
  updateFieldSet,
  validateFieldDraft,
  validateFieldSetDraft,
} from "../src/features/fields";
import type { FieldDraft, FieldSetDraft } from "../src/features/fields";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { CustomValue, MarkupItem, Project } from "../src/model/types";
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

describe("field draft validation", () => {
  it("requires a label and a unique key per scope", () => {
    const project = makeProject();
    const codes = (input: Partial<FieldDraft>) =>
      validateFieldDraft(project, draft(input)).map((problem) => problem.code);
    expect(codes({ label: "" })).toContain("labelRequired");
    expect(codes({ key: "" })).toContain("keyRequired");
    expect(codes({ key: "-bad" })).toContain("keyInvalid");

    addField(project, { key: "fireClass" });
    expect(codes({ key: "fireClass" })).toContain("keyExists");
    // The same key in another scope is a different field.
    expect(codes({ key: "fireClass", scope: "space" })).toEqual([]);
  });

  it("requires options for an enum and a label on every option", () => {
    const project = makeProject();
    expect(
      validateFieldDraft(project, draft({ type: "enum", options: [] })).map((p) => p.code),
    ).toContain("optionsRequired");
    expect(
      validateFieldDraft(
        project,
        draft({ type: "enum", options: [{ id: "opt_1", label: " " }] }),
      ).map((p) => p.code),
    ).toContain("optionLabelRequired");
    expect(
      validateFieldDraft(
        project,
        draft({ type: "multiEnum", options: [{ id: "opt_1", label: "A" }] }),
      ),
    ).toEqual([]);
  });

  it("rejects an inconsistent range, a bad length and a mismatched default", () => {
    const project = makeProject();
    expect(
      validateFieldDraft(project, draft({ type: "number", min: "10", max: "5" })).map(
        (p) => p.code,
      ),
    ).toContain("minInvalid");
    expect(
      validateFieldDraft(project, draft({ type: "text", maxLength: "0" })).map((p) => p.code),
    ).toContain("maxLengthInvalid");
    expect(
      validateFieldDraft(project, draft({ type: "number", defaultRaw: "text" })).map((p) => p.code),
    ).toContain("defaultInvalid");
  });

  it("keeps the key and scope permanent and blocks an in-use type change", () => {
    const project = makeProject();
    const field = addField(project);
    const item = measurement(project, { custom: { [field.id]: "EI30" } });
    expect(item.custom?.[field.id]).toBe("EI30");

    const problems = validateFieldDraft(project, {
      ...fieldDraftFor(field),
      key: "renamed",
      scope: "space",
    });
    const codes = problems.map((problem) => problem.code);
    expect(codes).toContain("keyLocked");
    expect(codes).toContain("scopeLocked");

    const typeProblem = validateFieldDraft(project, {
      ...fieldDraftFor(field),
      type: "number",
    }).find((problem) => problem.code === "typeLocked");
    expect(typeProblem?.count).toBe(1);
  });

  it("allows a type change while no value exists", () => {
    const project = makeProject();
    const field = addField(project);
    const problems = updateField(project, { ...fieldDraftFor(field), type: "number" });
    expect(problems).toEqual([]);
    expect(field.type).toBe("number");
  });

  it("blocks removing an enum option that values still use", () => {
    const project = makeProject();
    const field = addField(project, {
      type: "enum",
      options: [
        { id: "opt_ei30", label: "EI30" },
        { id: "opt_ei60", label: "EI60" },
      ],
    });
    measurement(project, { custom: { [field.id]: "opt_ei30" } });
    expect(enumOptionValueCount(project, field.id, "opt_ei30")).toBe(1);

    const removed = updateField(project, {
      ...fieldDraftFor(field),
      options: [{ id: "opt_ei60", label: "EI60" }],
    });
    const problem = removed.find((entry) => entry.code === "optionInUse");
    expect(problem?.count).toBe(1);
    expect(problem?.name).toBe("EI30");

    // An unused option can be removed and a label can change.
    expect(
      updateField(project, {
        ...fieldDraftFor(field),
        options: [
          { id: "opt_ei30", label: "Fire class EI30" },
          { id: "opt_ei60", label: "EI60" },
          { id: "opt_ei90", label: "EI90" },
        ],
      }),
    ).toEqual([]);
    expect(field.options?.map((option) => option.label)).toContain("Fire class EI30");
  });
});

describe("field creation and ordering", () => {
  it("appends new fields in scope order and reorders them", () => {
    const project = makeProject();
    const first = addField(project, { key: "first", label: "First" });
    const second = addField(project, { key: "second", label: "Second" });
    expect(fieldsForScope(project, "measurement").map((field) => field.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(moveField(project, second.id, -1)).toBe(true);
    expect(fieldsForScope(project, "measurement").map((field) => field.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(moveField(project, second.id, -1)).toBe(false);
  });

  it("counts values on hidden and locked items as well", () => {
    const project = makeProject();
    const field = addField(project);
    measurement(project, { visible: false, custom: { [field.id]: "EI30" } });
    measurement(project, { locked: true, custom: { [field.id]: "EI60" } });
    expect(fieldValueCount(project, field.id)).toEqual({
      itemCount: 2,
      spaceCount: 0,
      total: 2,
    });
  });
});

describe("typed value coercion", () => {
  it("trims text, clears empty input and enforces the length", () => {
    const project = makeProject();
    const field = addField(project, { type: "text", maxLength: "4" });
    expect(coerceFieldInput(field, "  EI30 ")).toEqual({ value: "EI30" });
    expect(coerceFieldInput(field, "   ")).toEqual({});
    expect(coerceFieldInput(field, "EI300")).toEqual({ problem: "tooLong" });
  });

  it("rejects a non-number and enforces the range", () => {
    const project = makeProject();
    const field = addField(project, { type: "number", min: "1", max: "10" });
    expect(coerceFieldInput(field, "4.5")).toEqual({ value: 4.5 });
    expect(coerceFieldInput(field, "abc")).toEqual({ problem: "notANumber" });
    expect(coerceFieldInput(field, "0")).toEqual({ problem: "belowMin" });
    expect(coerceFieldInput(field, "11")).toEqual({ problem: "aboveMax" });
    expect(coerceFieldInput(field, "")).toEqual({});
  });

  it("handles booleans, dates and enum options", () => {
    const project = makeProject();
    const bool = addField(project, { key: "bool", type: "boolean" });
    expect(coerceFieldInput(bool, true)).toEqual({ value: true });
    expect(coerceFieldInput(bool, "true")).toEqual({ problem: "invalidValue" });

    const date = addField(project, { key: "date", type: "date" });
    expect(coerceFieldInput(date, "2026-02-01")).toEqual({ value: "2026-02-01" });
    expect(coerceFieldInput(date, "not-a-date")).toEqual({ problem: "notADate" });

    const choice = addField(project, {
      key: "choice",
      type: "enum",
      options: [
        { id: "opt_a", label: "A" },
        { id: "opt_b", label: "B" },
      ],
    });
    expect(coerceFieldInput(choice, "opt_a")).toEqual({ value: "opt_a" });
    expect(coerceFieldInput(choice, "opt_missing")).toEqual({ problem: "unknownOption" });
  });

  it("orders multi-enum ids and rejects unknown ids", () => {
    const project = makeProject();
    const field = addField(project, {
      key: "tags",
      type: "multiEnum",
      options: [
        { id: "opt_a", label: "A" },
        { id: "opt_b", label: "B" },
      ],
    });
    expect(coerceFieldInput(field, ["opt_b", "opt_a"])).toEqual({ value: ["opt_a", "opt_b"] });
    expect(coerceFieldInput(field, ["opt_a", "opt_x"])).toEqual({
      problem: "unknownOption",
    });
    expect(coerceFieldInput(field, [])).toEqual({});
  });

  it("reports a stored value that does not match its field", () => {
    const project = makeProject();
    const field = addField(project, { type: "number" });
    expect(storedValueProblem(field, 4)).toBeNull();
    expect(storedValueProblem(field, "4")).toBe("invalidValue");
    expect(storedValueProblem(field, undefined)).toBeNull();
  });
});

describe("custom value mapping", () => {
  it("maps ids to labels and keeps numbers and booleans stable", () => {
    const project = makeProject();
    const choice = addField(project, {
      key: "choice",
      type: "enum",
      options: [{ id: "opt_a", label: "Class A" }],
    });
    expect(customValueText(choice, "opt_a")).toBe("Class A");
    expect(customValueText(choice, "opt_unknown")).toBe("opt_unknown");

    const tags = addField(project, {
      key: "tags",
      type: "multiEnum",
      options: [
        { id: "opt_a", label: "A" },
        { id: "opt_b", label: "B" },
      ],
    });
    expect(customValueText(tags, ["opt_a", "opt_b"])).toBe("A, B");
    expect(customValueText(tags, [])).toBe("");

    const bool = addField(project, { key: "bool", type: "boolean" });
    expect(customValueText(bool, true)).toBe("true");
    expect(customValueText(bool, false)).toBe("false");
    const number = addField(project, { key: "number", type: "number" });
    expect(customValueText(number, 12.5)).toBe("12.5");
  });

  it("builds the stable custom:<fieldId> reference", () => {
    expect(customFieldRef({ id: "field_1" })).toBe("custom:field_1");
  });
});

describe("appliesTo", () => {
  it("matches every measurement without a filter", () => {
    const project = makeProject();
    const field = addField(project);
    const item = measurement(project);
    expect(fieldAppliesToItem(field, item)).toBe(true);
    expect(applicableFields(project, item).map((entry) => entry.id)).toEqual([field.id]);
  });

  it("filters on item kind, category and count type", () => {
    const project = makeProject();
    const onlyAreas = addField(project, {
      key: "onlyAreas",
      label: "Only areas",
      appliesTo: { itemKinds: ["area"] },
    });
    const item = measurement(project);
    expect(fieldAppliesToItem(onlyAreas, item)).toBe(true);
    expect(fieldAppliesToItem(onlyAreas, { ...item, kind: "length" })).toBe(false);

    const otherCategory = addField(project, {
      key: "otherCategory",
      label: "Other category",
      appliesTo: { categoryIds: ["cat_missing"] },
    });
    expect(fieldAppliesToItem(otherCategory, item)).toBe(false);
    expect(fieldAppliesToItem(otherCategory, { ...item, categoryId: undefined })).toBe(false);

    const onlyDoors = addField(project, {
      key: "onlyDoors",
      label: "Only doors",
      appliesTo: { countTypes: ["door"] },
    });
    expect(fieldAppliesToItem(onlyDoors, item)).toBe(false);
    expect(fieldAppliesToItem(onlyDoors, { ...item, kind: "count", countType: "door" })).toBe(true);
  });

  it("keeps a space-scoped field out of the measurement inspector", () => {
    const project = makeProject();
    const spaceField = addField(project, {
      key: "spaceField",
      label: "Space field",
      scope: "space",
    });
    expect(fieldAppliesToItem(spaceField, measurement(project))).toBe(false);
  });
});

describe("field deletion", () => {
  it("removes the field, its values and its set membership in one call", () => {
    const project = makeProject();
    const field = addField(project);
    const kept = addField(project, { key: "kept", label: "Kept" });
    measurement(project, { custom: { [field.id]: "EI30", [kept.id]: "x" } });
    measurement(project, { custom: { [field.id]: "EI60" } });
    project.spaces.push({
      id: "space_1",
      kind: "room",
      name: "Room 1",
      areaMode: "manual",
      areaM2: 10,
      custom: { [field.id]: "EI30" },
      createdAt: NOW,
      updatedAt: NOW,
    });
    const set = createFieldSet(
      project,
      setDraft({ name: "Fire", fieldIds: [field.id, kept.id] }),
      "fset_1",
    ).set!;
    expect(set.fieldIds).toContain(field.id);

    const result = deleteField(project, field.id);
    expect(result).toEqual({
      removed: true,
      clearedItems: 2,
      clearedSpaces: 1,
      removedFromSets: 1,
    });
    expect(project.fieldDefinitions.map((entry) => entry.id)).toEqual([kept.id]);
    expect(project.fieldSets[0].fieldIds).toEqual([kept.id]);
    expect(project.spaces[0].custom).toBeUndefined();
    for (const layer of project.layers) {
      for (const item of layer.items) {
        expect(item.custom?.[field.id]).toBeUndefined();
        expect(item.custom?.[kept.id]).toBe(item.custom ? "x" : undefined);
      }
    }
  });

  it("reports a missing field instead of throwing", () => {
    const project = makeProject();
    expect(deleteField(project, "field_missing").removed).toBe(false);
  });
});

describe("field sets", () => {
  it("validates name and membership", () => {
    const project = makeProject();
    const field = addField(project);
    expect(
      validateFieldSetDraft(project, setDraft({ name: "", fieldIds: [field.id] })).map(
        (p) => p.code,
      ),
    ).toContain("setNameRequired");
    expect(
      validateFieldSetDraft(project, setDraft({ name: "Fire", fieldIds: [] })).map((p) => p.code),
    ).toContain("setNeedsField");
    createFieldSet(project, setDraft({ name: "Fire", fieldIds: [field.id] }), "fset_1");
    expect(
      validateFieldSetDraft(project, setDraft({ name: "Fire", fieldIds: [field.id] })).map(
        (p) => p.code,
      ),
    ).toContain("setNameExists");
  });

  it("creates, edits and deletes a set and resolves members in field order", () => {
    const project = makeProject();
    const first = addField(project, { key: "first", label: "First" });
    const second = addField(project, { key: "second", label: "Second" });
    const set = createFieldSet(
      project,
      setDraft({ name: "Fire", fieldIds: [second.id, first.id] }),
      "fset_1",
    ).set!;
    expect(set.fieldIds).toEqual([second.id, first.id]);
    expect(fieldSetFields(project, set.id).map((field) => field.id)).toEqual([first.id, second.id]);

    expect(
      updateFieldSet(project, {
        ...setDraft({ name: "Fire class", fieldIds: [first.id] }),
        id: set.id,
      }),
    ).toEqual([]);
    expect(project.fieldSets[0].name).toBe("Fire class");
    expect(project.fieldSets[0].fieldIds).toEqual([first.id]);
    expect(deleteFieldSet(project, set.id)).toBe(true);
    expect(project.fieldSets).toEqual([]);
  });

  it("fills defaults on a measurement without overwriting a value", () => {
    const project = makeProject();
    const withDefault = addField(project, {
      key: "withDefault",
      label: "With default",
      defaultRaw: "EI30",
    });
    const withoutDefault = addField(project, {
      key: "withoutDefault",
      label: "Without default",
    });
    const existing = addField(project, {
      key: "existing",
      label: "Existing",
      defaultRaw: "keep",
    });
    const scoped = addField(project, {
      key: "scoped",
      label: "Scoped",
      defaultRaw: "no",
      appliesTo: { itemKinds: ["count"] },
    });
    const set = createFieldSet(
      project,
      setDraft({
        name: "Fire",
        fieldIds: [withDefault.id, withoutDefault.id, existing.id, scoped.id],
      }),
      "fset_1",
    ).set!;
    const item = measurement(project, { custom: { [existing.id]: "own" } });

    expect(fieldSetDefaultCount(project, item.id, set.id)).toBe(1);
    const result = applyFieldSet(project, item.id, set.id);
    expect(result).toEqual({ applied: 1, skipped: 3 });
    expect(fieldSetDefaultCount(project, item.id, set.id)).toBe(0);
    expect(item.custom?.[withDefault.id]).toBe("EI30");
    expect(item.custom?.[existing.id]).toBe("own");
    expect(item.custom?.[withoutDefault.id]).toBeUndefined();
    expect(item.custom?.[scoped.id]).toBeUndefined();
  });

  it("writes explicit values only, never a calculated value", () => {
    const project = makeProject();
    const field = addField(project, { type: "number" });
    const item = measurement(project);
    const set = createFieldSet(
      project,
      setDraft({ name: "Empty", fieldIds: [field.id] }),
      "fset_1",
    ).set!;
    expect(applyFieldSet(project, item.id, set.id)).toEqual({ applied: 0, skipped: 1 });
    expect(item.custom).toBeUndefined();
    expect(applyFieldSet(project, "item_missing", set.id)).toEqual({ applied: 0, skipped: 0 });
  });

  it("never writes a default that does not match its field", () => {
    const project = makeProject();
    const field = addField(project, { type: "number", defaultRaw: 5 });
    const item = measurement(project);
    // Simulate a hand-edited or damaged project file.
    field.defaultValue = "five";
    const set = createFieldSet(
      project,
      setDraft({ name: "Damaged", fieldIds: [field.id] }),
      "fset_1",
    ).set!;
    expect(fieldSetDefaultCount(project, item.id, set.id)).toBe(0);
    expect(applyFieldSet(project, item.id, set.id)).toEqual({ applied: 0, skipped: 1 });
    expect(item.custom).toBeUndefined();
  });
});

describe("custom values stay explicit", () => {
  it("does not inherit a value from a field set without a default", () => {
    const project = makeProject();
    const field = addField(project);
    const item = measurement(project);
    const value: CustomValue | undefined = item.custom?.[field.id];
    expect(value).toBeUndefined();
  });
});
