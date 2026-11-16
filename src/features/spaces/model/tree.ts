import { spaceParentMap } from "../../../model/spaces";
import type { Space } from "../../../model/types";

/**
 * Space-tree traversal. The parent links are resolved by `model/spaces`, so a
 * missing parent or a cycle cuts to a root and is reported by the validator
 * instead of breaking the walk. Sibling order is the order of `project.spaces`.
 */

export interface SpaceNode {
  space: Space;
  depth: number;
}

/** One entry per space id: the first record wins, as in the validator. */
export function uniqueSpaces(spaces: readonly Space[]): Space[] {
  const seen = new Set<string>();
  const ordered: Space[] = [];
  for (const space of spaces) {
    if (seen.has(space.id)) continue;
    seen.add(space.id);
    ordered.push(space);
  }
  return ordered;
}

function childrenMap(spaces: readonly Space[]): {
  children: Map<string, Space[]>;
  roots: Space[];
} {
  const ordered = uniqueSpaces(spaces);
  const parentOf = spaceParentMap(ordered);
  const children = new Map<string, Space[]>();
  const roots: Space[] = [];
  for (const space of ordered) {
    const parent = parentOf.get(space.id) ?? null;
    if (!parent) {
      roots.push(space);
      continue;
    }
    const list = children.get(parent) ?? [];
    list.push(space);
    children.set(parent, list);
  }
  return { children, roots };
}

/** Depth-first order with a depth per row, ready for an indented register. */
export function spaceTree(spaces: readonly Space[]): SpaceNode[] {
  const { children, roots } = childrenMap(spaces);
  const nodes: SpaceNode[] = [];
  const walk = (entries: readonly Space[], depth: number) => {
    for (const space of entries) {
      nodes.push({ space, depth });
      walk(children.get(space.id) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  return nodes;
}

/** The space itself and every descendant, used for cycle checks and moves. */
export function spaceSubtreeIds(spaces: readonly Space[], spaceId: string): Set<string> {
  const { children } = childrenMap(spaces);
  const ids = new Set<string>([spaceId]);
  const queue = [spaceId];
  while (queue.length) {
    const current = queue.pop() as string;
    for (const child of children.get(current) ?? []) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

/**
 * Whether `parentId` may become the parent of `spaceId`. A space never becomes
 * its own ancestor, and a parent that does not exist is refused rather than
 * written as a dangling link.
 */
export function canReparent(
  spaces: readonly Space[],
  spaceId: string | undefined,
  parentId: string,
): boolean {
  if (!parentId) return true;
  if (spaceId !== undefined) {
    if (parentId === spaceId) return false;
    if (spaceSubtreeIds(spaces, spaceId).has(parentId)) return false;
  }
  return spaces.some((space) => space.id === parentId);
}

/** Spaces that may be chosen as the parent of `spaceId`, in tree order. */
export function parentCandidates(spaces: readonly Space[], spaceId?: string): SpaceNode[] {
  const blocked = spaceId === undefined ? new Set<string>() : spaceSubtreeIds(spaces, spaceId);
  return spaceTree(spaces).filter((node) => !blocked.has(node.space.id));
}

/** Swaps a space with its previous or next sibling; one caller-side undo step. */
export function moveSpace(spaces: Space[], spaceId: string, direction: -1 | 1): boolean {
  const index = spaces.findIndex((space) => space.id === spaceId);
  if (index < 0) return false;
  const parentOf = spaceParentMap(spaces);
  const parent = parentOf.get(spaceId) ?? null;
  const siblings = spaces.filter((space) => (parentOf.get(space.id) ?? null) === parent);
  const position = siblings.findIndex((space) => space.id === spaceId);
  const neighbour = siblings[position + direction];
  if (!neighbour) return false;
  const neighbourIndex = spaces.findIndex((space) => space.id === neighbour.id);
  if (neighbourIndex < 0) return false;
  const [record] = spaces.splice(index, 1);
  spaces.splice(neighbourIndex > index ? neighbourIndex - 1 : neighbourIndex, 0, record);
  return true;
}

/**
 * Spaces whose room number is used more than once under the same parent. The
 * validator reports the same fact as a warning; the register marks the rows.
 */
export function duplicateNumberSpaceIds(spaces: readonly Space[]): Set<string> {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const space of uniqueSpaces(spaces)) {
    const number = space.number?.trim().toLowerCase();
    if (!number) continue;
    const key = `${space.parentId ?? ""}:${number}`;
    const first = seen.get(key);
    if (first) {
      duplicates.add(first);
      duplicates.add(space.id);
      continue;
    }
    seen.set(key, space.id);
  }
  return duplicates;
}
