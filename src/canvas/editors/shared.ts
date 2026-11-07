import type { LabelBox, LabelMetrics } from "../../model/label";
import type { LabelLayout } from "../../model/labelLayout";
import { TEXT_FONT_STACK } from "../../model/text";
import type { Layer, MarkupItem, Point, TextAlign, TextRun } from "../../model/types";
import type { RichEditorController } from "../richEditor";

export const FONT_STACK = TEXT_FONT_STACK;

/** Keeps the inline editor readable on both light and dark text colours. */
export function editorSurface(color: string): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!match) return "rgba(255, 255, 255, 0.94)";
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((part) => part + part)
          .join("")
      : match[1];
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.55 ? "rgba(12, 16, 18, 0.9)" : "rgba(255, 255, 255, 0.94)";
}

export interface TextStyleSnapshot {
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  boxWidth?: number;
  boxHeight?: number;
  runs?: TextRun[];
}

export interface TextEditSession {
  mode: "text" | "textbox" | "cloud" | "callout";
  itemId: string | null;
  layerId: string | null;
  page: number;
  anchor: Point;
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  boxWidth?: number;
  boxHeight?: number;
  padding?: number;
  runs?: TextRun[];
  original?: TextStyleSnapshot;
  closing: boolean;
  container: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  richEditor: RichEditorController | null;
  strip: HTMLDivElement;
  resizeHandle: HTMLDivElement | null;
}

export interface LabelEditSession {
  itemId: string;
  layerId: string;
  page: number;
  value: string;
  original: string | undefined;
  closing: boolean;
  container: HTMLDivElement;
  input: HTMLInputElement;
}

export interface LabelHit {
  layer: Layer;
  item: MarkupItem;
}

export interface EditorHost {
  host: HTMLElement;
  width(): number;
  toScreen(point: Point): Point;
  pageLabelLayouts(): Map<string, LabelLayout>;
  screenLabelBox(box: LabelBox, metrics: LabelMetrics): LabelBox;
  drawContent(): void;
  drawInteraction(): void;
}

export interface EditorState {
  host: EditorHost;
  editorLayer: HTMLDivElement;
  text: TextEditSession | null;
  label: LabelEditSession | null;
  editingItem: string | null;
  editingLabel: string | null;
}

export function closeTextEditor(state: EditorState): void {
  if (!state.text) return;
  state.text.container.remove();
  state.text = null;
  state.editingItem = null;
  state.host.drawContent();
  state.host.drawInteraction();
}

export function cancelTextEdit(state: EditorState): void {
  if (!state.text) return;
  state.text.closing = true;
  closeTextEditor(state);
}
