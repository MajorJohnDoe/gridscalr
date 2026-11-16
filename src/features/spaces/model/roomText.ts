import { makeId } from "../../../model/calibration";
import type { Project, Space } from "../../../model/types";

/**
 * Explicit room creation from the room text that already exists on
 * measurements. Nothing is inferred and nothing is linked: the new rooms are
 * empty until the user links a measurement to them. It is only ever called from
 * a user action, never during load or migration.
 */

export interface RoomTextCandidate {
  /** The room text as it was first written. */
  room: string;
  /** How many measurements carry this room text, ignoring case and padding. */
  count: number;
  /** A room with the same name already exists under the target parent. */
  existing: boolean;
}

export interface CreateRoomsResult {
  created: Space[];
  /** Names that were already present under the parent, or duplicated. */
  skipped: string[];
}

function roomKey(value: string): string {
  return value.trim().toLowerCase();
}

function roomsUnder(project: Project, parentId: string): Set<string> {
  return new Set(
    project.spaces
      .filter((space) => space.kind === "room" && (space.parentId ?? "") === parentId)
      .map((space) => roomKey(space.name)),
  );
}

/**
 * Unique room texts in the project, with the measurement count. Hidden
 * measurements still carry room text, so they are counted here; the derived
 * area excludes them.
 */
export function roomTextCandidates(project: Project, parentId = ""): RoomTextCandidate[] {
  const existing = roomsUnder(project, parentId);
  const counts = new Map<string, RoomTextCandidate>();
  for (const layer of project.layers) {
    for (const item of layer.items) {
      const room = item.room?.trim();
      if (!room || room.length < 1) continue;
      const key = roomKey(room);
      const entry = counts.get(key);
      if (entry) {
        entry.count += 1;
        continue;
      }
      counts.set(key, { room: room.slice(0, 120), count: 1, existing: existing.has(key) });
    }
  }
  return [...counts.values()].sort((left, right) => left.room.localeCompare(right.room));
}

/**
 * Creates one measured room per unique room text under `parentId`. Existing
 * rooms with the same name under that parent are kept and reported, and the
 * input list is de-duplicated again so a repeated name cannot create two rooms.
 */
export function createRoomsFromText(
  project: Project,
  rooms: readonly string[],
  options: { parentId?: string; now?: string } = {},
): CreateRoomsResult {
  const parentId = options.parentId ?? "";
  const now = options.now ?? new Date().toISOString();
  if (parentId && !project.spaces.some((space) => space.id === parentId)) {
    return { created: [], skipped: rooms.map((room) => room.trim()).filter(Boolean) };
  }
  const existing = roomsUnder(project, parentId);
  const created: Space[] = [];
  const skipped: string[] = [];
  for (const room of rooms) {
    const name = room.trim().slice(0, 120);
    if (!name) continue;
    const key = roomKey(name);
    if (existing.has(key)) {
      skipped.push(name);
      continue;
    }
    existing.add(key);
    const space: Space = {
      id: makeId("space"),
      kind: "room",
      name,
      areaMode: "measured",
      createdAt: now,
      updatedAt: now,
    };
    if (parentId) space.parentId = parentId;
    project.spaces.push(space);
    created.push(space);
  }
  return { created, skipped };
}
