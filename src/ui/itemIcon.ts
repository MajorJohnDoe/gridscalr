import type { MarkupItem } from "../model/types";

/** Icon name for a markup item kind, shared by the Layers and Markups panels. */
export function markupIcon(kind: MarkupItem["kind"]): string {
  switch (kind) {
    case "length":
      return "length";
    case "area":
      return "area";
    case "count":
      return "count";
    case "pen":
      return "pen";
    case "line":
      return "line";
    case "arrow":
      return "arrow";
    case "rect":
      return "rect";
    case "ellipse":
      return "ellipse";
    case "highlight":
      return "highlight";
    case "text":
      return "text";
    case "image":
      return "image";
    case "cloud":
      return "cloud";
    case "callout":
      return "callout";
    case "stamp":
      return "stamp";
    case "delta":
      return "delta";
  }
}
