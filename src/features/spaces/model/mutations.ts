import { makeId } from "../../../model/calibration";
import { spaceParentMap } from "../../../model/spaces";
import type { CustomValue, Project, Space, SpaceAreaMode, SpaceKind } from "../../../model/types";
import { canReparent } from "./tree";

/**
 * Space mutations. Every function changes the project in place and returns
 * what it did; the caller owns the store mutation so one user action is one
 * undo step. Deleting a space never deletes a measurement: the link is cleared
 * and reported.
 */

export type SpaceProblemCode =
  | "missingSpaceName"
  | "invalidManualArea"
  | "missingSpaceParent"
  | "spaceParentCycle"
  | "spaceNotFound"
  | "measurementNotFound"
  | "measurementNotArea"
  | "measurementLocked";

export interface SpaceProblem {
  code: SpaceProblemCode;
  /** Form property to attach the message to, when there is one. */
  property?: string;
}

/** The editor holds raw text so an empty or invalid number is never guessed. */
export interface SpaceDraft {
  /** Absent while creating a space. */
  id?: string;
  kind: SpaceKind;
  /** Empty means a root space. */
  parentId: string;
  number: string;
  name: string;
  floor: string;
  usage: string;
  status: string;
  areaMode: SpaceAreaMode;
  /** Manual area as typed; only stored when `areaMode` is `"manual"`. */
  areaM2: string;
  /** Empty means no page location. */
  pageId: string;
  custom: Record<string, CustomValue>;
}

export interface DeleteSpaceResult {
  removed: boolean;
  /** Child spaces block the delete instead of being reparented silently. */
  childCount: number;
  /** Measurements whose link was cleared. They are not deleted. */
  clearedMeasurements: number;
  /** Schedule filters that pointed at the space and were cleaned up. */
  clearedScheduleFilters: number;
}

function text(value: string, maxLength: number): string | undefined {
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || undefined;
}

export function emptySpaceDraft(
  spaces: readonly Space[],
  options: { kind?: SpaceKind; parentId?: string } = {},
): SpaceDraft {
  return {
    kind: options.kind ?? (spaces.length ? "room" : "building"),
    parentId: options.parentId ?? "",
    number: "",
    name: "",
    floor: "",
    usage: "",
    status: "",
    areaMode: "measured",
    areaM2: "",
    pageId: "",
    custom: {},
  };
}

export function spaceDraftFor(space: Space): SpaceDraft {
  return {
    id: space.id,
    kind: space.kind,
    parentId: space.parentId ?? "",
    number: space.number ?? "",
    name: space.name,
    floor: space.floor ?? "",
    usage: space.usage ?? "",
    status: space.status ?? "",
    areaMode: space.areaMode,
    areaM2: typeof space.areaM2 === "number" ? String(space.areaM2) : "",
    pageId: space.pageId ?? "",
    custom: { ...(space.custom ?? {}) },
  };
}

/** Area input for a manual space, or undefined when it is empty. */
export function manualAreaOf(draft: SpaceDraft): number | undefined {
  const raw = draft.areaM2.trim();
  if (!raw) return undefined;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Draft validation. Duplicate room numbers are deliberately absent: they are a
 * warning in the validator and never block a save.
 */
export function validateSpaceDraft(
  project: Pick<Project, "spaces" | "pages">,
  draft: SpaceDraft,
): SpaceProblem[] {
  const problems: SpaceProblem[] = [];
  if (!draft.name.trim()) problems.push({ code: "missingSpaceName", property: "name" });
  if (draft.parentId) {
    if (!project.spaces.some((space) => space.id === draft.parentId)) {
      problems.push({ code: "missingSpaceParent", property: "parentId" });
    } else if (!canReparent(project.spaces, draft.id, draft.parentId)) {
      problems.push({ code: "spaceParentCycle", property: "parentId" });
    }
  }
  if (draft.areaMode === "manual") {
    const raw = draft.areaM2.trim();
    const area = manualAreaOf(draft);
    if (raw && (area === undefined || area < 0)) {
      problems.push({ code: "invalidManualArea", property: "areaM2" });
    }
  }
  return problems;
}

function applyDraft(space: Space, draft: SpaceDraft, now: string): void {
  space.kind = draft.kind;
  const parentId = text(draft.parentId, 120);
  if (parentId) space.parentId = parentId;
  else delete space.parentId;
  const number = text(draft.number, 40);
  if (number) space.number = number;
  else delete space.number;
  space.name = draft.name.trim().slice(0, 120);
  const floor = text(draft.floor, 80);
  if (floor) space.floor = floor;
  else delete space.floor;
  const usage = text(draft.usage, 80);
  if (usage) space.usage = usage;
  else delete space.usage;
  const status = text(draft.status, 80);
  if (status) space.status = status;
  else delete space.status;
  space.areaMode = draft.areaMode;
  const manual = draft.areaMode === "manual" ? manualAreaOf(draft) : undefined;
  if (manual !== undefined) space.areaM2 = manual;
  else delete space.areaM2;
  const pageId = text(draft.pageId, 120);
  if (pageId) space.pageId = pageId;
  else delete space.pageId;
  if (Object.keys(draft.custom).length) space.custom = { ...draft.custom };
  else delete space.custom;
  space.updatedAt = now;
}

export interface SpaceMutationResult {
  space?: Space;
  problems: SpaceProblem[];
}

/** Creates one space. The caller wraps this in a single store mutation. */
export function createSpace(
  project: Project,
  draft: SpaceDraft,
  now: string = new Date().toISOString(),
): SpaceMutationResult {
  const problems = validateSpaceDraft(project, draft);
  if (problems.length) return { problems };
  const space: Space = {
    id: makeId("space"),
    kind: draft.kind,
    name: draft.name.trim().slice(0, 120),
    areaMode: draft.areaMode,
    createdAt: now,
    updatedAt: now,
  };
  applyDraft(space, draft, now);
  project.spaces.push(space);
  return { space, problems: [] };
}

/** Updates one space. A missing or rejected draft changes nothing. */
export function updateSpace(
  project: Project,
  draft: SpaceDraft,
  now: string = new Date().toISOString(),
): SpaceMutationResult {
  const index = draft.id ? project.spaces.findIndex((space) => space.id === draft.id) : -1;
  if (index < 0) return { problems: [{ code: "spaceNotFound" }] };
  const problems = validateSpaceDraft(project, draft);
  if (problems.length) return { problems };
  const space = project.spaces[index];
  applyDraft(space, draft, now);
  return { space, problems: [] };
}

/**
 * Deletes one space. A space with children is refused so a subtree is never
 * reparented silently. Linked measurements keep existing; only `spaceId` is
 * cleared, and schedule filters that pointed at the space are cleaned up.
 */
export function deleteSpace(project: Project, spaceId: string): DeleteSpaceResult {
  const index = project.spaces.findIndex((space) => space.id === spaceId);
  if (index < 0) {
    return { removed: false, childCount: 0, clearedMeasurements: 0, clearedScheduleFilters: 0 };
  }
  const parentOf = spaceParentMap(project.spaces);
  const childCount = project.spaces.filter(
    (space) => space.id !== spaceId && (parentOf.get(space.id) ?? null) === spaceId,
  ).length;
  if (childCount > 0) {
    return { removed: false, childCount, clearedMeasurements: 0, clearedScheduleFilters: 0 };
  }
  let clearedMeasurements = 0;
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (item.spaceId !== spaceId) continue;
      delete item.spaceId;
      item.updatedAt = new Date().toISOString();
      clearedMeasurements += 1;
    }
  }
  let clearedScheduleFilters = 0;
  for (const schedule of project.schedules) {
    const spaceIds = schedule.filters.spaceIds;
    if (!spaceIds?.includes(spaceId)) continue;
    const kept = spaceIds.filter((id) => id !== spaceId);
    clearedScheduleFilters += spaceIds.length - kept.length;
    if (kept.length) schedule.filters.spaceIds = kept;
    else delete schedule.filters.spaceIds;
  }
  project.spaces.splice(index, 1);
  project.updatedAt = new Date().toISOString();
  return { removed: true, childCount: 0, clearedMeasurements, clearedScheduleFilters };
}
