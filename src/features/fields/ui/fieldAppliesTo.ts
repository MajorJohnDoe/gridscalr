import { t } from "../../../i18n";
import { MEASUREMENT_ITEM_KINDS } from "../../../model/layers";
import { itemKindLabel } from "../../../model/measure";
import { SPACE_KINDS } from "../../../model/spaces";
import type { FieldAppliesTo, Project, SpaceKind } from "../../../model/types";
import { el } from "../../../ui/dom";
import type { FieldDraft } from "../model";

/** The `appliesTo` checkbox group in the field editor. */

const SPACE_KIND_KEYS: Record<SpaceKind, Parameters<typeof t>[0]> = {
  building: "fields.spaceKind.building",
  floor: "fields.spaceKind.floor",
  room: "fields.spaceKind.room",
  zone: "fields.spaceKind.zone",
};

function entriesFor(project: Project, draft: FieldDraft): { id: string; label: string }[] {
  const entries: { id: string; label: string }[] = [];
  if (draft.scope === "measurement") {
    for (const kind of MEASUREMENT_ITEM_KINDS) {
      entries.push({ id: `kind:${kind}`, label: itemKindLabel(kind) });
    }
    for (const category of project.categories) {
      entries.push({ id: `category:${category.id}`, label: category.name });
    }
    for (const countType of project.countTypes) {
      entries.push({ id: `count:${countType.id}`, label: countType.label });
    }
    return entries;
  }
  for (const kind of SPACE_KINDS) {
    entries.push({ id: `space:${kind}`, label: t(SPACE_KIND_KEYS[kind]) });
  }
  return entries;
}

function selectedIds(draft: FieldDraft): Set<string> {
  const selected = new Set<string>();
  for (const kind of draft.appliesTo.itemKinds ?? []) selected.add(`kind:${kind}`);
  for (const id of draft.appliesTo.categoryIds ?? []) selected.add(`category:${id}`);
  for (const id of draft.appliesTo.countTypes ?? []) selected.add(`count:${id}`);
  for (const kind of draft.appliesTo.spaceKinds ?? []) selected.add(`space:${kind}`);
  return selected;
}

export function fieldAppliesToEditor(project: Project, draft: FieldDraft): HTMLElement {
  const selected = selectedIds(draft);
  const section = el("div", "field");
  const title =
    draft.scope === "measurement" ? t("fields.appliesToMeasurement") : t("fields.appliesToSpace");
  section.append(el("span", "field-label", title));

  const group = el("div", "check-group");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", title);
  for (const entry of entriesFor(project, draft)) {
    const row = el("label", "check-row");
    const input = el("input");
    input.type = "checkbox";
    input.value = entry.id;
    input.checked = selected.has(entry.id);
    input.addEventListener("change", () => {
      const checked = [...group.querySelectorAll<HTMLInputElement>("input")]
        .filter((node) => node.checked)
        .map((node) => node.value);
      const strings = (prefix: string) =>
        checked
          .filter((value) => value.startsWith(prefix))
          .map((value) => value.slice(prefix.length));
      const applies: FieldAppliesTo = {};
      if (draft.scope === "measurement") {
        const itemKinds = strings("kind:");
        if (itemKinds.length) applies.itemKinds = itemKinds as FieldAppliesTo["itemKinds"];
        const categoryIds = strings("category:");
        if (categoryIds.length) applies.categoryIds = categoryIds;
        const countTypes = strings("count:");
        if (countTypes.length) applies.countTypes = countTypes;
      } else {
        const spaceKinds = strings("space:");
        if (spaceKinds.length) applies.spaceKinds = spaceKinds as FieldAppliesTo["spaceKinds"];
      }
      draft.appliesTo = applies;
    });
    row.append(input, el("span", "", entry.label));
    group.append(row);
  }
  section.append(group, el("p", "settings-note", t("fields.appliesToNote")));
  return section;
}
