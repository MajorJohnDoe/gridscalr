import { cloudLabelLayout } from "../model/annotations";
import {
  distance,
  itemLocalBounds,
  itemLocalToPage,
  itemRotation,
  midpoint,
  rotatePoint,
} from "../model/geometry";
import type { MarkupItem, Point } from "../model/types";
import { cursorForRole, handleLocalPoint, type BoxHandleRole } from "./geometry";

export type HandleRole = BoxHandleRole | "rotate" | "vertex" | "label";

export interface Handle {
  role: HandleRole;
  index: number;
  point: Point;
  cursor: string;
}

type ToScreen = (point: Point) => Point;

export function handleAt(
  item: MarkupItem,
  screen: Point,
  toScreen: ToScreen,
  tolerance: number,
): Handle | null {
  let best: Handle | null = null;
  let bestDistance = tolerance;
  for (const handle of selectionHandles(item, toScreen)) {
    const distanceToHandle = distance(screen, handle.point);
    if (distanceToHandle <= bestDistance) {
      best = handle;
      bestDistance = distanceToHandle;
    }
  }
  return best;
}

export function selectionHandles(item: MarkupItem, toScreen: ToScreen): Handle[] {
  if (item.kind === "count") return [];
  if (
    item.kind === "length" ||
    item.kind === "area" ||
    item.kind === "cloud" ||
    (item.kind === "highlight" && item.highlightShape !== "stroke")
  ) {
    const handles: Handle[] = item.points.slice(0, 80).map((point, index) => ({
      role: "vertex" as const,
      index,
      point: toScreen(itemLocalToPage(item, point)),
      cursor: "crosshair",
    }));
    if (item.kind === "cloud") {
      const label = cloudLabelLayout(item);
      if (label) {
        handles.push({
          role: "label",
          index: -1,
          point: toScreen(label.center),
          cursor: "move",
        });
      }
    }
    return handles;
  }

  if (item.kind === "callout") {
    return item.points.slice(0, 2).map((point, index) => ({
      role: "vertex" as const,
      index,
      point: toScreen(itemLocalToPage(item, point)),
      cursor: "crosshair",
    }));
  }

  if (item.kind === "stamp" || item.kind === "delta") {
    return [];
  }

  if (item.kind === "line" || item.kind === "arrow") {
    const handles: Handle[] = item.points.slice(0, 2).map((point, index) => ({
      role: "vertex" as const,
      index,
      point: toScreen(itemLocalToPage(item, point)),
      cursor: "crosshair",
    }));
    handles.push({
      role: "rotate",
      index: -1,
      point: rotationHandlePoint(item, toScreen),
      cursor: "grab",
    });
    return handles;
  }

  const bounds = itemLocalBounds(item);
  const center = midpoint(bounds.min, bounds.max);
  const rotation = itemRotation(item);
  const roles: BoxHandleRole[] =
    item.kind === "text" ? ["nw", "ne", "se", "sw"] : ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handles: Handle[] = roles.map((role) => {
    const local = handleLocalPoint(bounds, role);
    const point = toScreen(rotatePoint(local, center, rotation));
    return {
      role,
      index: -1,
      point,
      cursor: cursorForRole(role),
    };
  });
  handles.push({
    role: "rotate",
    index: -1,
    point: rotationHandlePoint(item, toScreen),
    cursor: "grab",
  });
  return handles;
}

export function rotationHandlePoint(item: MarkupItem, toScreen: ToScreen): Point {
  const bounds = itemLocalBounds(item);
  const center = midpoint(bounds.min, bounds.max);
  const rotation = itemRotation(item);
  const top = rotatePoint({ x: center.x, y: bounds.min.y }, center, rotation);
  const topScreen = toScreen(top);
  const upPage = rotatePoint({ x: center.x, y: center.y - 1 }, center, rotation);
  const centerScreen = toScreen(center);
  const upScreen = toScreen(upPage);
  const length = Math.max(
    1e-6,
    Math.hypot(upScreen.x - centerScreen.x, upScreen.y - centerScreen.y),
  );
  return {
    x: topScreen.x + ((upScreen.x - centerScreen.x) / length) * 26,
    y: topScreen.y + ((upScreen.y - centerScreen.y) / length) * 26,
  };
}
