import { findItem, itemIsLocked } from "../../model/layers";
import { itemMetrics } from "../../model/measure";
import { store } from "../../state/store";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";
import type { EditorState, LabelEditSession, LabelHit } from "./shared";
import { commitTextEdit } from "./textCommit";

export function startLabelEdit(state: EditorState, hit: LabelHit): void {
  if (itemIsLocked(hit.item, hit.layer)) {
    toast(t("editors.itemLocked"), "warning");
    return;
  }
  if (state.text) void commitTextEdit(state);
  const container = document.createElement("div");
  container.className = "canvas-label-editor";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "canvas-label-editor-input";
  input.value = hit.item.label ?? "";
  input.placeholder = t("editors.addLabel");
  input.setAttribute("aria-label", t("editors.measurementLabel"));
  const hint = document.createElement("span");
  hint.className = "canvas-label-editor-hint";
  const project = store.project;
  const metrics = project ? itemMetrics(hit.item, project) : null;
  hint.textContent = metrics
    ? `${metrics.primary}${metrics.secondary ? ` · ${metrics.secondary}` : ""}`
    : "";
  container.append(input, hint);
  const edit: LabelEditSession = {
    itemId: hit.item.id,
    layerId: hit.layer.id,
    page: hit.item.page,
    value: hit.item.label ?? "",
    original: hit.item.label,
    closing: false,
    container,
    input,
  };
  state.label = edit;
  state.editingLabel = hit.item.id;
  state.editorLayer.append(container);
  positionLabelEditor(state);

  input.addEventListener("input", () => {
    edit.value = input.value;
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void commitLabelEdit(state);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelLabelEdit(state);
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!state.label || state.label !== edit || edit.closing) return;
      const active = document.activeElement;
      if (active && state.editorLayer.contains(active)) return;
      void commitLabelEdit(state);
    }, 0);
  });
  state.host.drawContent();
  state.host.drawInteraction();
  window.requestAnimationFrame(() => {
    if (state.label !== edit) return;
    input.focus({ preventScroll: true });
    input.select();
  });
}

export function positionLabelEditor(state: EditorState): void {
  const edit = state.label;
  if (!edit || edit.closing || !store.project) return;
  const found = findItem(store.project, edit.itemId);
  if (!found) return;
  const layout = state.host.pageLabelLayouts().get(found.item.id);
  if (!layout) return;
  const box = state.host.screenLabelBox(layout.box, layout.metrics);
  const width = Math.max(150, box.width + 42);
  edit.container.style.left = `${Math.max(6, Math.min(state.host.width() - width - 6, box.x - 20))}px`;
  edit.container.style.top = `${Math.max(6, box.y)}px`;
  edit.container.style.width = `${width}px`;
  edit.container.style.minHeight = `${Math.max(28, box.height)}px`;
}

export function closeLabelEditor(state: EditorState): void {
  if (!state.label) return;
  state.label.container.remove();
  state.label = null;
  state.editingLabel = null;
  state.host.drawContent();
  state.host.drawInteraction();
}

export async function commitLabelEdit(state: EditorState): Promise<void> {
  const edit = state.label;
  if (!edit || edit.closing) return;
  edit.closing = true;
  const value = edit.value.trim();
  const original = (edit.original ?? "").trim();
  closeLabelEditor(state);
  if (value === original) return;
  store.mutate((project) => {
    const item = findItem(project, edit.itemId)?.item;
    if (!item) return;
    item.label = value || undefined;
    item.updatedAt = new Date().toISOString();
  }, "change");
}

export function cancelLabelEdit(state: EditorState): void {
  if (!state.label) return;
  state.label.closing = true;
  closeLabelEditor(state);
}
