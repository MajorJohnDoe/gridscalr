import { textBoxLayout } from "../../model/annotations";
import { normalizeColor } from "../../model/color";
import { TEXT_LINE_HEIGHT, measureTextWidth, textItemLayout } from "../../model/text";
import { store } from "../../state/store";
import { rotatedAabb } from "../geometry";
import { FONT_STACK, editorSurface, type EditorState } from "./shared";

export function positionTextEditor(state: EditorState): void {
  const edit = state.text;
  if (!edit || edit.closing) return;
  const zoom = store.ui.zoom;
  const anchor = state.host.toScreen(edit.anchor);
  const input = edit.richEditor?.element ?? edit.textarea;
  let left: number;
  let top: number;
  let width: number;
  let height: number;
  let rotation = edit.rotation;
  let lineHeight: number;
  let fontSize: number;
  if (edit.mode === "textbox") {
    width = Math.max(20, (edit.boxWidth ?? 100) * zoom);
    height = Math.max(16, (edit.boxHeight ?? 40) * zoom);
    left = anchor.x;
    top = anchor.y;
    lineHeight = Math.max(1, edit.fontSize * TEXT_LINE_HEIGHT * zoom);
    fontSize = Math.max(1, edit.fontSize * zoom);
    rotation = 0;
    const pad = Math.max(1, (edit.padding ?? 4) * zoom);
    input.style.padding = `${pad}px`;
    input.style.whiteSpace = "pre-wrap";
  } else if (edit.mode === "cloud" || edit.mode === "callout") {
    const layout = textBoxLayout(edit.text, edit.fontSize, edit.boxWidth, edit.boxHeight);
    width = Math.max(40, layout.width * zoom);
    height = Math.max(20, layout.height * zoom);
    left = anchor.x - width / 2;
    top = anchor.y - height / 2;
    lineHeight = layout.lineHeight * zoom;
    fontSize = Math.max(1, layout.fontSize * zoom);
    rotation = 0;
    const horizontalPadding = Math.max(2, layout.padding * zoom);
    const verticalPadding = Math.max(2, (height - layout.lines.length * lineHeight) / 2);
    input.style.padding = `${verticalPadding}px ${horizontalPadding}px`;
    input.style.whiteSpace = "pre-wrap";
  } else {
    const layout = textItemLayout({ text: edit.text, fontSize: edit.fontSize }, measureTextWidth);
    width = Math.max(52, layout.width * zoom + 4);
    height = Math.max(layout.lineHeight * zoom + 4, layout.height * zoom + 4);
    left = anchor.x - 2;
    top = anchor.y - 2;
    lineHeight = layout.lineHeight * zoom;
    fontSize = Math.max(1, layout.fontSize * zoom);
    input.style.padding = "2px";
    input.style.whiteSpace = "pre";
  }
  input.style.left = `${left}px`;
  input.style.top = `${top}px`;
  input.style.width = `${width}px`;
  input.style.height = `${height}px`;
  input.style.fontSize = `${fontSize}px`;
  input.style.lineHeight = `${lineHeight}px`;
  input.style.fontFamily = FONT_STACK;
  const color = normalizeColor(edit.color, store.ui.style.color);
  input.style.color = color;
  input.style.background = editorSurface(color);
  input.style.transform = `rotate(${rotation}deg)`;
  input.style.transformOrigin = "center";
  if (edit.resizeHandle) {
    edit.resizeHandle.style.left = `${left + width - 7}px`;
    edit.resizeHandle.style.top = `${top + height - 7}px`;
  }

  const box = rotatedAabb(left, top, width, height, rotation);
  const stripWidth = edit.strip.offsetWidth || 270;
  const stripLeft = Math.max(8, Math.min(state.host.width() - stripWidth - 8, box.minX));
  let stripTop = box.minY - 44;
  if (stripTop < 8) stripTop = box.maxY + 8;
  edit.strip.style.left = `${stripLeft}px`;
  edit.strip.style.top = `${Math.max(8, stripTop)}px`;
}
