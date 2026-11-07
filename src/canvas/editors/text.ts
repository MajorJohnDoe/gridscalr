import { calloutLayout, cloudLabelLayout } from "../../model/annotations";
import { expandRect, itemCenter, itemRotation, normalizeDegrees } from "../../model/geometry";
import { itemIsLocked } from "../../model/layers";
import { runsFromItem } from "../../model/richText";
import { clampTextSize } from "../../model/text";
import type { Layer, MarkupItem, Point } from "../../model/types";
import { store } from "../../state/store";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";
import type { EditorState } from "./shared";
import { beginTextEditSession } from "./textSession";
import { commitTextEdit } from "./textCommit";

export function startNewText(state: EditorState, point: Point): void {
  if (state.text) void commitTextEdit(state);
  const style = store.ui.style;
  beginTextEditSession(state, {
    mode: "text",
    itemId: null,
    layerId: null,
    page: store.ui.page,
    anchor: point,
    text: "",
    color: style.color,
    fontSize: style.fontSize,
    rotation: 0,
    bold: false,
    italic: false,
    underline: false,
    align: "left",
  });
}

export function startTextEdit(state: EditorState, item: MarkupItem, layer: Layer): void {
  if (itemIsLocked(item, layer)) {
    toast(t("editors.itemLocked"), "warning");
    return;
  }
  if (state.text) void commitTextEdit(state);
  const fontSize = clampTextSize(item.fontSize ?? 12);
  const rotation = normalizeDegrees(itemRotation(item));
  beginTextEditSession(state, {
    mode: "text",
    itemId: item.id,
    layerId: layer.id,
    page: item.page,
    anchor: item.points[0] ?? { x: 0, y: 0 },
    text: item.text ?? "",
    color: item.color,
    fontSize,
    rotation,
    bold: item.textBold === true,
    italic: item.textItalic === true,
    underline: item.textUnderline === true,
    align: item.textAlign ?? "left",
    original: {
      text: item.text ?? "",
      color: item.color,
      fontSize,
      rotation,
      bold: item.textBold === true,
      italic: item.textItalic === true,
      underline: item.textUnderline === true,
      align: item.textAlign ?? "left",
    },
  });
}

export function startTextBoxEdit(state: EditorState, item: MarkupItem, layer: Layer): void {
  if (itemIsLocked(item, layer)) {
    toast(t("editors.itemLocked"), "warning");
    return;
  }
  if (item.points.length < 2) return;
  if (state.text) void commitTextEdit(state);
  const rect = expandRect(item.points[0], item.points[1]);
  const fontSize = clampTextSize(item.fontSize ?? 12);
  const color = item.textColor ?? item.color;
  const align = item.textAlign ?? "left";
  const runs = runsFromItem(item);
  beginTextEditSession(state, {
    mode: "textbox",
    itemId: item.id,
    layerId: layer.id,
    page: item.page,
    anchor: { x: rect.x, y: rect.y },
    text: item.text ?? "",
    color,
    fontSize,
    rotation: 0,
    bold: item.textBold === true,
    italic: item.textItalic === true,
    underline: item.textUnderline === true,
    align,
    boxWidth: rect.width,
    boxHeight: rect.height,
    padding: item.padding ?? 4,
    runs,
    original: {
      text: item.text ?? "",
      color,
      fontSize,
      rotation: 0,
      bold: item.textBold === true,
      italic: item.textItalic === true,
      underline: item.textUnderline === true,
      align,
      boxWidth: rect.width,
      boxHeight: rect.height,
      runs,
    },
  });
}

export function startCloudTextEdit(state: EditorState, item: MarkupItem, layer: Layer): void {
  if (itemIsLocked(item, layer)) {
    toast(t("editors.itemLocked"), "warning");
    return;
  }
  if (state.text) void commitTextEdit(state);
  const label = cloudLabelLayout(item);
  const fontSize = clampTextSize(item.fontSize ?? 12);
  const color = item.textColor ?? "#f7fbfc";
  const align = item.textAlign ?? "center";
  beginTextEditSession(state, {
    mode: "cloud",
    itemId: item.id,
    layerId: layer.id,
    page: item.page,
    anchor: label?.center ?? itemCenter(item),
    text: item.text ?? "",
    color,
    fontSize,
    rotation: 0,
    bold: item.textBold === true,
    italic: item.textItalic === true,
    underline: item.textUnderline === true,
    align,
    boxWidth: item.textBoxWidth,
    boxHeight: item.textBoxHeight,
    original: {
      text: item.text ?? "",
      color,
      fontSize,
      rotation: 0,
      bold: item.textBold === true,
      italic: item.textItalic === true,
      underline: item.textUnderline === true,
      align,
      boxWidth: item.textBoxWidth,
      boxHeight: item.textBoxHeight,
    },
  });
}

export function startCalloutTextEdit(state: EditorState, item: MarkupItem, layer: Layer): void {
  if (itemIsLocked(item, layer)) {
    toast(t("editors.itemLocked"), "warning");
    return;
  }
  if (state.text) void commitTextEdit(state);
  const layout = calloutLayout(item);
  const fontSize = clampTextSize(item.fontSize ?? 12);
  const color = item.textColor ?? "#f7fbfc";
  const align = item.textAlign ?? "center";
  beginTextEditSession(state, {
    mode: "callout",
    itemId: item.id,
    layerId: layer.id,
    page: item.page,
    anchor: layout.center,
    text: item.text ?? "",
    color,
    fontSize,
    rotation: 0,
    bold: item.textBold === true,
    italic: item.textItalic === true,
    underline: item.textUnderline === true,
    align,
    boxWidth: item.textBoxWidth,
    boxHeight: item.textBoxHeight,
    original: {
      text: item.text ?? "",
      color,
      fontSize,
      rotation: 0,
      bold: item.textBold === true,
      italic: item.textItalic === true,
      underline: item.textUnderline === true,
      align,
      boxWidth: item.textBoxWidth,
      boxHeight: item.textBoxHeight,
    },
  });
}
