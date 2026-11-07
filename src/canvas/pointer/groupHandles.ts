import type { Point } from "../../model/types";
import { distance, type Bounds } from "../../model/geometry";
import { cursorForRole, handleLocalPoint, type BoxHandleRole } from "../geometry";
import type { Handle } from "../selectionHandles";

const GROUP_HANDLE_ROLES: BoxHandleRole[] = ["nw", "ne", "se", "sw"];

export function groupHandles(
  bounds: Bounds,
  toScreen: (point: Point) => Point,
): Array<Handle & { role: BoxHandleRole }> {
  return GROUP_HANDLE_ROLES.map((role) => {
    const point = handleLocalPoint(bounds, role);
    return {
      role,
      index: -1,
      point: toScreen(point),
      cursor: cursorForRole(role),
    };
  });
}

export function groupHandleAt(
  bounds: Bounds,
  screen: Point,
  toScreen: (point: Point) => Point,
  tolerance: number,
): (Handle & { role: BoxHandleRole }) | null {
  let best: (Handle & { role: BoxHandleRole }) | null = null;
  let bestDistance = tolerance;
  for (const handle of groupHandles(bounds, toScreen)) {
    const d = distance(screen, handle.point);
    if (d <= bestDistance) {
      best = handle;
      bestDistance = d;
    }
  }
  return best;
}
