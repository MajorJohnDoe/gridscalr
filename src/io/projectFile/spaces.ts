import { isSpaceAreaMode, isSpaceKind } from "../../model/spaces";
import type { FieldDefinition, PageId, Space } from "../../model/types";
import { normalizeCustomValues } from "./fields";
import { uniqueId } from "./shared";

const NAME_MAX_LENGTH = 120;
const TEXT_MAX_LENGTH = 80;
const NUMBER_MAX_LENGTH = 40;

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || undefined;
}

/**
 * Normalizes the space register. A structurally invalid space is dropped and
 * reported; a dangling parent or page link is kept for the doctor where the
 * plan requires it, except a page link, which is cleared deterministically.
 */
export function normalizeSpaces(
  value: unknown,
  fields: readonly FieldDefinition[],
  pageIds: ReadonlySet<PageId>,
  report?: (code: string) => void,
): Space[] {
  if (!Array.isArray(value)) return [];
  const spaces: Space[] = [];
  const ids = new Set<string>();
  const now = new Date().toISOString();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedSpace");
      continue;
    }
    const raw = entry as Partial<Space>;
    const rawId = typeof raw.id === "string" ? raw.id.trim().slice(0, 120) : "";
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, NAME_MAX_LENGTH) : "";
    if (!rawId || !name || !isSpaceKind(raw.kind) || !isSpaceAreaMode(raw.areaMode)) {
      report?.("droppedSpace");
      continue;
    }
    const space: Space = {
      id: uniqueId(rawId, ids),
      kind: raw.kind,
      name,
      areaMode: raw.areaMode,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
    };
    const parentId = text(raw.parentId, 120);
    if (parentId) space.parentId = parentId;
    const number = text(raw.number, NUMBER_MAX_LENGTH);
    if (number) space.number = number;
    const floor = text(raw.floor, TEXT_MAX_LENGTH);
    if (floor) space.floor = floor;
    const usage = text(raw.usage, TEXT_MAX_LENGTH);
    if (usage) space.usage = usage;
    const status = text(raw.status, TEXT_MAX_LENGTH);
    if (status) space.status = status;
    if (raw.areaMode === "manual") {
      if (typeof raw.areaM2 === "number" && Number.isFinite(raw.areaM2) && raw.areaM2 >= 0) {
        space.areaM2 = Math.min(1_000_000_000, raw.areaM2);
      }
    } else if (raw.areaM2 !== undefined) {
      // A measured space never keeps a manual area: the linked measurements are
      // the only source of truth.
      report?.("repairedSpaceArea");
    }
    if (raw.pageId !== undefined) {
      if (typeof raw.pageId === "string" && pageIds.has(raw.pageId)) {
        space.pageId = raw.pageId;
      } else {
        report?.("repairedSpacePage");
      }
    }
    const custom = normalizeCustomValues(raw.custom, fields, "space", report);
    if (custom) space.custom = custom;
    spaces.push(space);
  }
  return spaces;
}
