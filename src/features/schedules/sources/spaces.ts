import { formatNumber } from "../../../i18n/format";
import { formatTimestamp } from "../../../model/dates";
import { pageNumber } from "../../../model/pages";
import type {
  Project,
  ScheduleDefinition,
  ScheduleFieldRef,
  ScheduleFilter,
  Space,
} from "../../../model/types";
import { t, type MessageKey } from "../../../i18n";
import { customFieldIdForRef } from "../../../model/schedules";
import type { FieldDefinition } from "../../../model/types";
import { customValueText } from "../../fields";
import { spaceAreas } from "../../spaces";
import type { SpaceArea } from "../../spaces";
import { scheduleFilterContext, spaceMatchesFilters } from "../model/filters";
import { scheduleRefs } from "../model/fields";
import type { ScheduleCell, ScheduleRow } from "../model/types";

/**
 * The space source. Area comes from the spaces feature (`spaceAreas`), never
 * from a second formula here: measured wins over manual, hidden links are
 * excluded and a missing area stays empty instead of being guessed.
 */

function textCell(text: string): ScheduleCell {
  return { text, value: null, invalid: false };
}

function areaSourceLabel(area: SpaceArea): string {
  return t(`spaces.area.${area.source}` as MessageKey);
}

function cellFor(
  space: Space,
  area: SpaceArea | undefined,
  parentName: string,
  project: Project,
  fields: ReadonlyMap<string, FieldDefinition>,
  ref: ScheduleFieldRef,
): ScheduleCell {
  const customId = customFieldIdForRef(ref);
  if (customId) {
    const field = fields.get(customId);
    if (!field || field.scope !== "space") return { text: "", value: null, invalid: true };
    const value = space.custom?.[customId];
    return {
      text: customValueText(field, value),
      value: typeof value === "number" ? value : null,
      invalid: false,
    };
  }
  switch (ref) {
    case "id":
      return textCell(space.id);
    case "kind":
      return textCell(t(`spaces.kind.${space.kind}` as MessageKey));
    case "number":
      return textCell(space.number ?? "");
    case "name":
      return textCell(space.name);
    case "floor":
      return textCell(space.floor ?? "");
    case "usage":
      return textCell(space.usage ?? "");
    case "status":
      return textCell(space.status ?? "");
    case "area": {
      const value = area?.areaM2 ?? null;
      return { text: value === null ? "" : formatNumber(value, 2), value, invalid: false };
    }
    case "areaSource":
      return textCell(area ? areaSourceLabel(area) : t("spaces.area.missing"));
    case "parent":
      return textCell(parentName);
    case "page":
      return textCell(space.pageId ? String(pageNumber(project, space.pageId)) : "");
    case "created":
      return textCell(formatTimestamp(space.createdAt));
    case "modified":
      return textCell(formatTimestamp(space.updatedAt));
    default:
      return { text: "", value: null, invalid: true };
  }
}

export function spaceRows(
  project: Project,
  definition: ScheduleDefinition,
  extra?: ScheduleFilter,
): ScheduleRow[] {
  const context = scheduleFilterContext(project);
  const areas = spaceAreas(project);
  const refs = scheduleRefs(definition);
  const rows: ScheduleRow[] = [];
  for (const space of project.spaces) {
    if (!spaceMatchesFilters(space, context, [definition.filters, extra])) continue;
    const parentName = space.parentId ? (context.spaceById.get(space.parentId)?.name ?? "") : "";
    const values: Record<string, ScheduleCell> = {};
    for (const ref of refs) {
      values[ref] = cellFor(
        space,
        areas.get(space.id),
        parentName,
        project,
        context.fieldById,
        ref,
      );
    }
    rows.push({
      rowId: `space:${space.id}`,
      entityId: space.id,
      pageId: space.pageId,
      cells: [],
      values,
      groupPath: [],
    });
  }
  return rows;
}
