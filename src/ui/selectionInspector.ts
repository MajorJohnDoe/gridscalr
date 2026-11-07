import { findItem, itemIsLocked, itemIsVisible } from "../model/layers";
import { itemMetrics } from "../model/measure";
import { store } from "../state/store";
import { el } from "./dom";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import { t } from "../i18n";
import { appendDrawing } from "./inspector/drawing";
import { appendImage } from "./inspector/image";
import { appendItemActions } from "./inspector/itemActions";
import { appendLabel } from "./inspector/label";
import { appendMeasurement } from "./inspector/measurement";
import { multiSelectionSection } from "./inspector/multiSelection";
import { appendStyle } from "./inspector/style";
import { appendSummary } from "./inspector/summary";
import { appendSymbol } from "./inspector/symbol";
import type { InspectorContext } from "./inspector/context";

export function selectionSection(
  project: NonNullable<typeof store.project>,
  actions: PanelActions,
): HTMLElement {
  const refs = store.ui.selection;
  if (refs.length > 1) return multiSelectionSection(project, refs, actions);

  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", t("inspector.selectionHeader")));
  if (refs.length) head.append(el("span", "status-chip is-selected", t("inspector.selectedChip")));
  section.append(head);
  const selection = refs[0] ?? null;
  const found = selection ? findItem(project, selection.itemId) : undefined;
  if (!selection || !found) {
    const note = el("div", "empty-note small");
    note.style.padding = "12px 6px";
    note.innerHTML = icon("cursor", 18);
    note.append(el("div", "", t("inspector.emptySelection")));
    section.append(note);
    return section;
  }

  const { item, layer } = found;
  const context: InspectorContext = {
    project,
    selection,
    item,
    layer,
    actions,
    locked: itemIsLocked(item, layer),
    hidden: !itemIsVisible(item, layer),
    metrics: itemMetrics(item, project),
    section,
  };
  appendSummary(section, context);
  appendMeasurement(section, context);
  appendImage(section, context);
  appendLabel(section, context);
  appendSymbol(section, context);
  appendDrawing(section, context);
  appendStyle(section, context);
  appendItemActions(section, context);
  return section;
}
