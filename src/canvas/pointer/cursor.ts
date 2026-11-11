import type { ToolId } from "../../state/store";
import { cursorForRole } from "../geometry";
import type { Handle } from "../selectionHandles";
import type { DragState } from "./pointerState";

export interface CursorState {
  readOnly: boolean;
  viewOnly: boolean;
  cropActive: boolean;
  cropCursor: string | null;
  panActive: boolean;
  drag: DragState | null;
  labelConnect: boolean;
  spaceDown: boolean;
  activeTool: ToolId;
  marquee: boolean;
  hoverLabelResize: boolean;
  hoverHandle: Handle | null;
  hover: boolean;
}

export function cursorForState(state: CursorState): string {
  if (state.readOnly) return "";
  if (state.viewOnly) {
    if (state.panActive) return "grabbing";
    if (state.spaceDown || state.activeTool === "pan") return "grab";
    if (state.marquee) return "crosshair";
    if (state.hover) return "pointer";
    return "";
  }
  if (state.cropActive) return state.cropCursor ?? "crosshair";
  if (state.panActive) return "grabbing";
  if (state.drag) {
    const drag = state.drag;
    if (drag.mode === "rotate") return "grabbing";
    if ((drag.mode === "resize" || drag.mode === "scale-selection") && drag.handle) {
      return cursorForRole(drag.handle);
    }
    if (drag.mode === "vertex") return "crosshair";
    if (drag.mode === "measurement-label-size") return "nwse-resize";
    return "move";
  }
  if (state.labelConnect) return "crosshair";
  if (state.spaceDown || state.activeTool === "pan") return "grab";
  if (state.marquee) return "crosshair";
  if (state.hoverLabelResize) return "nwse-resize";
  if (state.hoverHandle) return state.hoverHandle.cursor;
  if (state.activeTool === "text") return "text";
  if (state.activeTool !== "select") return "crosshair";
  if (state.hover) return "move";
  return "";
}
