import type { Space, SpaceAreaMode, SpaceKind } from "./types";

/**
 * Pure space-tree rules. A space is a building, floor, room or zone; parentage
 * is an optional `parentId` and sibling order is the order of `project.spaces`.
 * Invalid links are reported, never removed here.
 */

export const SPACE_KINDS: readonly SpaceKind[] = ["building", "floor", "room", "zone"];
export const SPACE_AREA_MODES: readonly SpaceAreaMode[] = ["measured", "manual"];

export function isSpaceKind(value: unknown): value is SpaceKind {
  return typeof value === "string" && (SPACE_KINDS as readonly string[]).includes(value);
}

export function isSpaceAreaMode(value: unknown): value is SpaceAreaMode {
  return typeof value === "string" && (SPACE_AREA_MODES as readonly string[]).includes(value);
}

export type SpaceParentIssueCode = "missingSpaceParent" | "spaceParentCycle";

export interface SpaceParentIssue {
  code: SpaceParentIssueCode;
  spaceId: string;
}

function rawParentId(space: Space): string | null {
  return typeof space.parentId === "string" && space.parentId.trim() ? space.parentId.trim() : null;
}

function parentIssueMap(spaces: readonly Space[]): {
  parentOfId: Map<string, string | null>;
  issues: SpaceParentIssue[];
} {
  const byId = new Map<string, Space>();
  for (const space of spaces) if (!byId.has(space.id)) byId.set(space.id, space);
  const parentOfId = new Map<string, string | null>();
  const issues: SpaceParentIssue[] = [];
  for (const space of byId.values()) {
    const raw = rawParentId(space);
    if (!raw) {
      parentOfId.set(space.id, null);
      continue;
    }
    if (raw === space.id) {
      issues.push({ code: "spaceParentCycle", spaceId: space.id });
      parentOfId.set(space.id, null);
      continue;
    }
    if (!byId.has(raw)) {
      issues.push({ code: "missingSpaceParent", spaceId: space.id });
      parentOfId.set(space.id, null);
      continue;
    }
    parentOfId.set(space.id, raw);
  }

  const settled = new Map<string, boolean>();
  for (const id of byId.keys()) {
    if (settled.has(id)) continue;
    const chain: string[] = [];
    const position = new Map<string, number>();
    let current: string | null = id;
    while (current && !settled.has(current)) {
      const seenAt = position.get(current);
      if (seenAt !== undefined) {
        for (const cycleId of chain.slice(seenAt)) {
          parentOfId.set(cycleId, null);
          settled.set(cycleId, true);
          issues.push({ code: "spaceParentCycle", spaceId: cycleId });
        }
        break;
      }
      position.set(current, chain.length);
      chain.push(current);
      current = parentOfId.get(current) ?? null;
      if (current === null) break;
    }
    for (const chainId of chain) {
      if (!settled.has(chainId)) settled.set(chainId, true);
    }
  }
  return { parentOfId, issues };
}

export function spaceParentIssues(spaces: readonly Space[]): SpaceParentIssue[] {
  return parentIssueMap(spaces).issues;
}

/** Resolved parent id per space, with invalid links cut for traversal only. */
export function spaceParentMap(spaces: readonly Space[]): ReadonlyMap<string, string | null> {
  return parentIssueMap(spaces).parentOfId;
}
