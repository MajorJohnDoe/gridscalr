import { findCategory } from "../model/categories";
import { normalizeColor } from "../model/color";
import { ensureActiveLayer } from "../model/layers";
import { DEFAULT_LINE_TYPE_ID } from "../model/lineTypes";
import { currentPageId } from "../model/pages";
import { selectionKey, uniqueSelectionRefs } from "../model/selection";
import { DEFAULT_DRAWING_STROKE_WIDTH, mergeDrawStyle, mergeLineStyle } from "../model/style";
import { DEFAULT_SYMBOL_ID } from "../model/symbols";
import { resolveViewOnlyTool } from "../model/viewOnly";
import type { CloudFillPreset } from "../model/cloud";
import type {
  AreaMode,
  AreaShape,
  ArrowHeads,
  CountType,
  HighlightShape,
  InspectionStatus,
  LayerKind,
  Point,
  Project,
  SelectionRef,
} from "../model/types";
import type { ChangeReason, DrawStyle, LeftTab, ToolId, UIState } from "./types";

/** Session callbacks into the owning store; none of them mutate the project. */
export interface SessionStoreHost {
  notify(reason: ChangeReason): void;
  project(): Project | null;
  readOnly(): boolean;
}

/**
 * Tools armed from the symbol library keep that tab open so the tile stays
 * visibly selected, including for library-only operation-card tools such as
 * the I/O rail.
 */
const LIBRARY_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(["symbol", "rail"]);

export function toolLayerKind(tool: ToolId): LayerKind | null {
  switch (tool) {
    case "length":
    case "area":
    case "count":
    case "radius":
    case "diameter":
    case "arc":
    case "angle":
    case "slope":
    case "volume":
    case "calibrate":
      return "measure";
    case "pen":
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
    case "highlight":
    case "text":
    case "textbox":
    case "polyline":
    case "rail":
    case "cloud":
    case "callout":
    case "stamp":
    case "delta":
    case "symbol":
      return "draw";
    case "pan":
    case "select":
      return null;
    default:
      return null;
  }
}

function defaultUI(): UIState {
  return {
    activeTool: "select",
    page: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    selection: [],
    hover: null,
    cursor: null,
    leftTab: "pages",
    style: {
      color: "#f2a93b",
      strokeWidth: DEFAULT_DRAWING_STROKE_WIDTH,
      fillOpacity: 0.15,
      fontSize: 12,
      shapeFill: "outline",
      dashed: false,
    },
    stampText: "APPROVED",
    deltaText: "A",
    highlightShape: "stroke",
    cloudText: false,
    cloudFill: "none",
    arrowHeads: "end",
    measureCategoryId: null,
    measureRoom: "",
    measureCountType: "other",
    measureCountQuantity: 1,
    measureAreaMode: "add",
    measureAreaShape: "polygon",
    symbolId: DEFAULT_SYMBOL_ID,
    symbolStatus: null,
    lineTypeId: DEFAULT_LINE_TYPE_ID,
    lineStyle: { color: "#e30613", widthPt: 2, dashed: false },
  };
}

/**
 * Session and UI state that is not part of the project. It survives project
 * edits, is cleared when a project opens or closes, and never enters the project
 * file or the undo history.
 */
export class SessionStore {
  ui: UIState = defaultUI();
  private host: SessionStoreHost;

  constructor(host: SessionStoreHost) {
    this.host = host;
  }

  /** Applies the UI reset that accompanies opening a project. */
  reset(project: Project): void {
    this.ui.page = 1;
    this.ui.selection = [];
    this.ui.hover = null;
    this.ui.activeTool = "select";
    this.ui.cursor = null;
    this.ui.leftTab = "pages";
    this.ui.stampText = project.settings.stampPresets[0] ?? "APPROVED";
    this.ui.measureCategoryId = null;
    this.ui.measureRoom = "";
    this.ui.measureCountType = "other";
    this.ui.measureAreaMode = "add";
    this.ui.measureAreaShape = "polygon";
    this.ui.symbolId = DEFAULT_SYMBOL_ID;
    this.ui.lineTypeId = project.lineTypes.some((entry) => entry.id === this.ui.lineTypeId)
      ? this.ui.lineTypeId
      : (project.lineTypes[0]?.id ?? DEFAULT_LINE_TYPE_ID);
    const activeLineType = project.lineTypes.find((entry) => entry.id === this.ui.lineTypeId);
    if (activeLineType) {
      this.ui.lineStyle = {
        color: activeLineType.color,
        widthPt: activeLineType.widthPt,
        dashed: activeLineType.style === "dashed",
      };
    }
    this.ui.symbolStatus = null;
  }

  /** Applies the defaults used when the project is closed. */
  resetDefaults(): void {
    this.ui = defaultUI();
  }

  setView(zoom: number, panX: number, panY: number): void {
    this.ui.zoom = zoom;
    this.ui.panX = panX;
    this.ui.panY = panY;
    this.host.notify("view");
  }

  setLineType(id: string): void {
    const lineType = this.host.project()?.lineTypes.find((entry) => entry.id === id);
    if (!lineType) return;
    this.ui.lineTypeId = id;
    this.ui.lineStyle = {
      color: normalizeColor(lineType.color, this.ui.lineStyle.color),
      widthPt: lineType.widthPt,
      dashed: lineType.style === "dashed",
    };
    this.host.notify("tool");
  }

  setLineStyle(patch: Partial<UIState["lineStyle"]>): void {
    this.ui.lineStyle = mergeLineStyle(this.ui.lineStyle, patch);
    this.host.notify("tool");
  }

  setPage(page: number): void {
    const project = this.host.project();
    if (!project) return;
    const clamped = Math.max(1, Math.min(Math.max(1, project.pages.length), Math.round(page)));
    if (clamped === this.ui.page) return;
    this.ui.page = clamped;
    this.ui.selection = [];
    this.ui.hover = null;
    this.host.notify("page");
  }

  setTool(tool: ToolId): void {
    const project = this.host.project();
    const readOnly = this.host.readOnly();
    const next = readOnly ? resolveViewOnlyTool(tool) : tool;
    if (readOnly && next === this.ui.activeTool) return;
    this.ui.activeTool = next;
    if (project && !readOnly) {
      const kind = toolLayerKind(tool);
      if (kind) {
        ensureActiveLayer(project, kind, currentPageId(project, this.ui.page) ?? undefined);
        // Every markup tool targets a layer, so surface the Layers tab while
        // the user draws. Library tools keep the symbol library in view.
        this.ui.leftTab = LIBRARY_TOOLS.has(tool) ? "symbols" : "layers";
      }
    }
    this.host.notify("tool");
  }

  /** Arms a built-in symbol and keeps the Symbols tab open for repeated use. */
  selectSymbol(symbolId: string): void {
    this.ui.symbolId = symbolId;
    this.setTool("symbol");
  }

  setSymbolStatus(status: InspectionStatus | null): void {
    this.ui.symbolStatus = status;
    this.host.notify("tool");
  }

  setLeftTab(tab: LeftTab): void {
    this.ui.leftTab = tab;
    this.host.notify("change");
  }

  setStampText(text: string): void {
    this.ui.stampText = text;
    this.host.notify("tool");
  }

  setDeltaText(text: string): void {
    this.ui.deltaText = text;
    // Typing must not rebuild the context bar and steal focus.
    this.host.notify("cursor");
  }

  setHighlightShape(shape: HighlightShape): void {
    this.ui.highlightShape = shape;
    this.host.notify("tool");
  }

  setCloudText(enabled: boolean): void {
    this.ui.cloudText = enabled;
    this.host.notify("tool");
  }

  setCloudFill(preset: CloudFillPreset): void {
    this.ui.cloudFill = preset;
    this.host.notify("tool");
  }

  setArrowHeads(heads: ArrowHeads): void {
    this.ui.arrowHeads = heads;
    this.host.notify("tool");
  }

  get primarySelection(): SelectionRef | null {
    return this.ui.selection[0] ?? null;
  }

  setSelection(selection: SelectionRef | SelectionRef[] | null): void {
    this.setSelectionMany(
      selection === null ? [] : Array.isArray(selection) ? selection : [selection],
    );
  }

  setSelectionMany(selection: SelectionRef[]): void {
    const next = uniqueSelectionRefs(selection);
    if (
      next.length === this.ui.selection.length &&
      next.every((ref, index) => selectionKey(ref) === selectionKey(this.ui.selection[index]))
    ) {
      return;
    }
    this.ui.selection = next;
    this.host.notify("selection");
  }

  toggleSelection(ref: SelectionRef): void {
    const key = selectionKey(ref);
    if (this.ui.selection.some((entry) => selectionKey(entry) === key)) {
      this.setSelectionMany(this.ui.selection.filter((entry) => selectionKey(entry) !== key));
    } else {
      this.setSelectionMany([...this.ui.selection, ref]);
    }
  }

  isSelected(ref: SelectionRef): boolean {
    const key = selectionKey(ref);
    return this.ui.selection.some((entry) => selectionKey(entry) === key);
  }

  clearSelection(): void {
    this.setSelectionMany([]);
  }

  setHover(hover: UIState["hover"]): void {
    this.ui.hover = hover;
    this.host.notify("cursor");
  }

  setCursor(cursor: Point | null): void {
    this.ui.cursor = cursor;
    this.host.notify("cursor");
  }

  setStyle(style: Partial<DrawStyle>): void {
    this.ui.style = mergeDrawStyle(this.ui.style, style);
    this.host.notify("tool");
  }

  /**
   * Pending category and room are session state, not project data: they emit
   * "cursor" so typing a room name does not rebuild the panels and steal focus.
   */
  setMeasureCategory(categoryId: string | null): void {
    const project = this.host.project();
    if (!project) return;
    if (categoryId !== null && !findCategory(project, categoryId)) return;
    if (this.ui.measureCategoryId === categoryId) return;
    this.ui.measureCategoryId = categoryId;
    this.host.notify("cursor");
  }

  setMeasureRoom(room: string): void {
    if (this.ui.measureRoom === room) return;
    this.ui.measureRoom = room;
    this.host.notify("cursor");
  }

  setMeasureCountType(type: CountType): void {
    if (this.ui.measureCountType === type) return;
    this.ui.measureCountType = type;
    this.host.notify("cursor");
  }

  setMeasureCountQuantity(quantity: number): void {
    if (!Number.isFinite(quantity)) return;
    const value = Math.max(1, Math.min(100000, Math.round(quantity)));
    if (this.ui.measureCountQuantity === value) return;
    this.ui.measureCountQuantity = value;
    this.host.notify("cursor");
  }

  setMeasureAreaMode(mode: AreaMode): void {
    if (this.ui.measureAreaMode === mode) return;
    this.ui.measureAreaMode = mode;
    this.host.notify("cursor");
  }

  setMeasureAreaShape(shape: AreaShape): void {
    if (this.ui.measureAreaShape === shape) return;
    this.ui.measureAreaShape = shape;
    this.host.notify("cursor");
  }
}
