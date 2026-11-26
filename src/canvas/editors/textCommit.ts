import { findItem, itemIsLocked, layerLockedOnPage, layerVisibleOnPage } from "../../model/layers";
import { reconcileRuns } from "../../model/richText";
import type { TextRun } from "../../model/types";
import {
  applyAnnotationEdit,
  applyTextBoxEdit,
  applyTextItemEdit,
  createTextItem,
  textEditChanged,
  type CreatedTextItem,
  type NewTextInput,
  type TextEditValues,
} from "../../model/commands/editorText";
import { store } from "../../state/store";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";
import { closeTextEditor, type EditorState } from "./shared";

/** Runs for a text box session, from the rich editor or the plain fallback. */
function textBoxRuns(edit: EditorState["text"], value: string): TextRun[] {
  if (!edit) return [];
  if (edit.richEditor) return edit.richEditor.getRuns();
  return reconcileRuns(edit.runs ?? [{ text: value }], value);
}

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
    const values: TextEditValues = {
      text: value,
      color: edit.color,
      fontSize: edit.fontSize,
      rotation: edit.rotation,
      bold: edit.bold,
      italic: edit.italic,
      underline: edit.underline,
      align: edit.align,
      boxWidth: edit.boxWidth,
      boxHeight: edit.boxHeight,
      runs: edit.mode === "textbox" ? textBoxRuns(edit, value) : undefined,
    };
    const changed = textEditChanged(values, edit.original!);
    const itemId = edit.itemId;
    const mode = edit.mode;
    closeTextEditor(state);
    if (!changed) return;
    store.mutate((project) => {
      if (mode === "textbox") applyTextBoxEdit(project, itemId, values);
      else if (mode === "cloud" || mode === "callout")
        applyAnnotationEdit(project, itemId, values, t("reference.revision"));
      else applyTextItemEdit(project, itemId, values);
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
  if (
    active &&
    (!layerVisibleOnPage(active, edit.pageId) || layerLockedOnPage(active, edit.pageId))
  ) {
    toast(
      t("canvas.layerUnavailable", {
        name: active.name,
        state: layerLockedOnPage(active, edit.pageId)
          ? t("canvas.stateLocked")
          : t("canvas.stateHidden"),
      }),
      "warning",
    );
    closeTextEditor(state);
    return;
  }
  const input: NewTextInput = {
    pageId: edit.pageId,
    anchor: edit.anchor,
    text: value,
    color: edit.color,
    fontSize: edit.fontSize,
    rotation: edit.rotation,
    bold: edit.bold,
    italic: edit.italic,
    underline: edit.underline,
    align: edit.align,
  };
  closeTextEditor(state);
  const created: { ref: CreatedTextItem | null } = { ref: null };
  store.mutate((project) => {
    created.ref = createTextItem(project, input);
  }, "change");
  if (created.ref) {
    store.setSelection({ layerId: created.ref.layerId, itemId: created.ref.itemId });
    store.setTool("select");
  }
}
