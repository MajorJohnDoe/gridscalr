import { makeId } from "../../model/calibration";
import { normalizeDegrees } from "../../model/geometry";
import {
  addItem,
  ensureActiveLayer,
  findItem,
  itemIsLocked,
  layerLockedOnPage,
  layerVisibleOnPage,
} from "../../model/layers";
import { reconcileRuns, runsEqual, runsHaveFormatting } from "../../model/richText";
import { clampTextSize } from "../../model/text";
import type { MarkupItem } from "../../model/types";
import { store } from "../../state/store";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";
import { closeTextEditor, type EditorState } from "./shared";

export async function commitTextEdit(state: EditorState): Promise<void> {
  const edit = state.text;
  if (!edit || edit.closing) return;
  edit.closing = true;
  const project = store.project;
  if (!project) {
    closeTextEditor(state);
    return;
  }
  const value = edit.richEditor ? edit.richEditor.getText() : edit.text;
  if (edit.itemId) {
    const found = findItem(project, edit.itemId);
    if (!found || itemIsLocked(found.item, found.layer)) {
      closeTextEditor(state);
      return;
    }
    if (edit.mode === "textbox") {
      const original = edit.original!;
      const runs = edit.richEditor
        ? edit.richEditor.getRuns()
        : reconcileRuns(edit.runs ?? [{ text: value }], value);
      const changed =
        value !== original.text ||
        edit.color !== original.color ||
        Math.abs(edit.fontSize - original.fontSize) > 0.001 ||
        edit.bold !== original.bold ||
        edit.italic !== original.italic ||
        edit.underline !== original.underline ||
        edit.align !== original.align ||
        !runsEqual(runs, original.runs);
      closeTextEditor(state);
      if (!changed) return;
      store.mutate((project) => {
        const item = findItem(project, edit.itemId!)?.item;
        if (!item) return;
        item.text = value;
        item.textColor = edit.color;
        item.fontSize = clampTextSize(edit.fontSize);
        if (edit.bold) item.textBold = true;
        else delete item.textBold;
        if (edit.italic) item.textItalic = true;
        else delete item.textItalic;
        if (edit.underline) item.textUnderline = true;
        else delete item.textUnderline;
        if (edit.align === "left") delete item.textAlign;
        else item.textAlign = edit.align;
        if (runsHaveFormatting(runs, item)) item.runs = runs;
        else delete item.runs;
        item.updatedAt = new Date().toISOString();
      }, "change");
      return;
    }
    if (edit.mode === "cloud" || edit.mode === "callout") {
      const original = edit.original!;
      const changed =
        value !== original.text ||
        edit.color !== original.color ||
        Math.abs(edit.fontSize - original.fontSize) > 0.001 ||
        edit.bold !== original.bold ||
        edit.italic !== original.italic ||
        edit.underline !== original.underline ||
        edit.align !== original.align ||
        edit.boxWidth !== original.boxWidth ||
        edit.boxHeight !== original.boxHeight;
      closeTextEditor(state);
      if (!changed) return;
      store.mutate((project) => {
        const item = findItem(project, edit.itemId!)?.item;
        if (!item) return;
        item.text = value.trim() || t("reference.revision");
        item.textColor = edit.color;
        item.fontSize = clampTextSize(edit.fontSize);
        if (edit.bold) item.textBold = true;
        else delete item.textBold;
        if (edit.italic) item.textItalic = true;
        else delete item.textItalic;
        if (edit.underline) item.textUnderline = true;
        else delete item.textUnderline;
        if (edit.align === "center") delete item.textAlign;
        else item.textAlign = edit.align;
        if (edit.boxWidth) item.textBoxWidth = edit.boxWidth;
        else delete item.textBoxWidth;
        if (edit.boxHeight) item.textBoxHeight = edit.boxHeight;
        else delete item.textBoxHeight;
        item.updatedAt = new Date().toISOString();
      }, "change");
      return;
    }
    const original = edit.original!;
    const rotation = normalizeDegrees(edit.rotation);
    const changed =
      value !== original.text ||
      edit.color !== original.color ||
      Math.abs(edit.fontSize - original.fontSize) > 0.001 ||
      Math.abs(rotation - normalizeDegrees(original.rotation)) > 0.001 ||
      edit.bold !== original.bold ||
      edit.italic !== original.italic ||
      edit.underline !== original.underline ||
      edit.align !== original.align;
    closeTextEditor(state);
    if (!changed) return;
    store.mutate((project) => {
      const item = findItem(project, edit.itemId!)?.item;
      if (!item) return;
      item.text = value;
      item.color = edit.color;
      item.fontSize = clampTextSize(edit.fontSize);
      if (edit.bold) item.textBold = true;
      else delete item.textBold;
      if (edit.italic) item.textItalic = true;
      else delete item.textItalic;
      if (edit.underline) item.textUnderline = true;
      else delete item.textUnderline;
      if (edit.align === "left") delete item.textAlign;
      else item.textAlign = edit.align;
      if (rotation === 0) delete item.rotation;
      else item.rotation = rotation;
      item.updatedAt = new Date().toISOString();
    }, "change");
    return;
  }

  if (!value.trim()) {
    closeTextEditor(state);
    return;
  }
  const active = project.layers.find(
    (layer) => layer.id === project.activeLayerId && layer.kind === "draw",
  );
  if (active && (!layerVisibleOnPage(active, edit.page) || layerLockedOnPage(active, edit.page))) {
    toast(
      t("canvas.layerUnavailable", {
        name: active.name,
        state: layerLockedOnPage(active, edit.page)
          ? t("canvas.stateLocked")
          : t("canvas.stateHidden"),
      }),
      "warning",
    );
    closeTextEditor(state);
    return;
  }
  const rotation = normalizeDegrees(edit.rotation);
  let layerId = "";
  let itemId = "";
  closeTextEditor(state);
  store.mutate((project) => {
    const layer = ensureActiveLayer(project, "draw", edit.page);
    const now = new Date().toISOString();
    const item: MarkupItem = {
      id: makeId("item"),
      page: edit.page,
      kind: "text",
      points: [{ ...edit.anchor }],
      color: edit.color,
      strokeWidth: 2,
      text: value,
      fontSize: clampTextSize(edit.fontSize),
      textBold: edit.bold ? true : undefined,
      textItalic: edit.italic ? true : undefined,
      textUnderline: edit.underline ? true : undefined,
      textAlign: edit.align === "left" ? undefined : edit.align,
      rotation: rotation === 0 ? undefined : rotation,
      scale: null,
      createdAt: now,
      updatedAt: now,
    };
    addItem(project, layer.id, item);
    layerId = layer.id;
    itemId = item.id;
  }, "change");
  if (layerId && itemId) {
    store.setSelection({ layerId, itemId });
    store.setTool("select");
  }
}
