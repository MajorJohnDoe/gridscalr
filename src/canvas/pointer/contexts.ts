import type { Point } from "../../model/types";
import type { CreationContext } from "./creation";
import type { ContextMenuContext } from "./contextMenu";
import type { DoubleClickContext } from "./doubleClick";
import type { PointerHost } from "./PointerHost";

export function creationContext(
  host: PointerHost,
  capturePointer: (pointerId: number) => void,
): CreationContext {
  return {
    getDraft: () => host.draft(),
    setDraft: (draft) => host.setDraft(draft),
    snapPoint: (point, excludeItemId) => host.snapPoint(point, excludeItemId),
    snapPolylinePoint: (point) => host.snapPolylinePoint(point),
    constrainPolyline: (last, point, free) => host.constrainPolyline(last, point, free),
    clearSnap: () => host.clearSnap(),
    viewZoom: () => host.viewZoom(),
    drawInteraction: () => host.drawInteraction(),
    capturePointer,
    finishDraft: () => host.finishDraft(),
    finishCallout: (point) => host.finishCallout(point),
    createItem: (kind, points, options) => host.createItem(kind, points, options),
    runCalibration: (p1, p2) => host.runCalibration(p1, p2),
    startTextTool: (point) => host.startTextTool(point),
  };
}

export function contextMenuContext(
  host: PointerHost,
  localFromClient: (clientX: number, clientY: number) => Point,
  updateCursor: () => void,
  beginLabelConnection: (itemId: string, layerId: string) => void,
): ContextMenuContext {
  return {
    cropActive: () => host.cropActive(),
    localFromClient,
    toPage: (screen) => host.toPage(screen),
    viewPage: () => host.viewPage(),
    viewZoom: () => host.viewZoom(),
    measurementLabelHit: (screen) => host.measurementLabelHit(screen),
    isLocked: (item, layer) => host.isLocked(item, layer as Parameters<PointerHost["isLocked"]>[1]),
    selectItem: (layerId, itemId) => host.selectItem(layerId, itemId),
    openHostContextMenu: (position) => host.openContextMenu(position.clientX, position.clientY),
    beginLabelConnection,
    promptVolumeDepth: (ref) => host.promptVolumeDepth(ref),
    updateCursor,
    drawInteraction: () => host.drawInteraction(),
  };
}

export function doubleClickContext(host: PointerHost): DoubleClickContext {
  return {
    touchNavigationBlocked: () => host.touchNavigationBlocked(),
    cropActive: () => host.cropActive(),
    activeTool: () => host.activeTool(),
    viewPage: () => host.viewPage(),
    viewZoom: () => host.viewZoom(),
    toPage: (screen) => host.toPage(screen),
    finishDraft: () => host.finishDraft(),
    calibrationLabelHit: (screen) => host.calibrationLabelHit(screen),
    editCalibration: () => host.editCalibration(),
    measurementLabelHit: (screen) => host.measurementLabelHit(screen),
    isLocked: (item, layer) => host.isLocked(item, layer as Parameters<PointerHost["isLocked"]>[1]),
    selectItem: (layerId, itemId) => host.selectItem(layerId, itemId),
    promptVolumeDepth: (ref) => host.promptVolumeDepth(ref),
    startLabelEdit: (hit) => host.startLabelEdit(hit),
    editSheetFieldAt: (page, screen) => host.editSheetFieldAt(page, screen),
    startTextEdit: (item, layer) => host.startTextEdit(item, layer),
    startTextBoxEdit: (item, layer) => host.startTextBoxEdit(item, layer),
    editRail: (item) => host.editRail(item),
    startCloudTextEdit: (item, layer) => host.startCloudTextEdit(item, layer),
    startCalloutTextEdit: (item, layer) => host.startCalloutTextEdit(item, layer),
    editItemText: (item) => host.editItemText(item),
  };
}
