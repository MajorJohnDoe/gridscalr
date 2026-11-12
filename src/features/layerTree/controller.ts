import { t } from "../../i18n";
import { buildLayerHierarchy } from "../../model/layerHierarchy";
import type { Project } from "../../model/types";
import {
  dragSet,
  DropIndicator,
  LiveRegion,
  pruneSelection,
  selectionAfterClick,
  type ListSelectMode,
} from "../listInteraction";
import { layerDropPreview, layerRowSpans, type LayerDropPreview } from "./dropPreview";
import { layerMoveRejection, type LayerDropPlan } from "./operations";
import { ListAutoScroll } from "./scroll";

/**
 * Drag, keyboard nesting and multi-selection for the Layers panel tree.
 *
 * The panel shares the list conventions with Pages and Markups — grip handle,
 * drop line, live announcement, click/Ctrl/Shift selection — but a tree move is
 * not one flat insertion index, so this controller plans a parent-plus-position
 * drop instead of reusing the flat reorder controller. Every applied move is one
 * host callback, which the caller turns into one undo step.
 */

export interface LayerTreeControllerOptions {
  project: () => Pick<Project, "layers"> | null;
  canMove: () => boolean;
  /** Applies one validated move; returns true when the project changed. */
  apply: (ids: readonly string[], plan: LayerDropPlan) => boolean;
  isExpanded?: (layerId: string) => boolean;
  setExpanded?: (layerId: string, open: boolean) => void;
  /** Repaints the panel after a pure view change such as expand/collapse. */
  requestRender?: () => void;
  rowSelector?: string;
  mime: string;
}

function layerName(project: Pick<Project, "layers"> | null, layerId: string): string {
  return project?.layers.find((layer) => layer.id === layerId)?.name ?? "";
}

function rejectionMessage(rejection: string): string {
  if (rejection === "kind") return t("layer.dropKindRejected");
  if (rejection === "cycle" || rejection === "self") return t("layer.dropCycleRejected");
  return t("layer.dropUnknownRejected");
}

export class LayerTreeController {
  private readonly indicator = new DropIndicator({
    lineClass: "layer-drop-line",
    labelClass: "layer-drop-label",
  });
  private readonly announcer = new LiveRegion("layer-reorder-announcer");
  private readonly scroller = new ListAutoScroll();
  private readonly onDragOver = (event: DragEvent): void => this.handleDragOver(event);
  private readonly onDragLeave = (event: DragEvent): void => this.handleDragLeave(event);
  private readonly onDrop = (event: DragEvent): void => this.handleDrop(event);
  private list: HTMLElement | null = null;
  private scroll: HTMLElement | null = null;
  private selection: string[] = [];
  private anchor: string | null = null;
  private dragging: string[] = [];
  private preview: LayerDropPreview | null = null;
  private highlight: HTMLElement | null = null;
  private pendingFocus: string | null = null;

  constructor(private readonly options: LayerTreeControllerOptions) {}

  /** Selected layer ids in display order. */
  selectionIds(): string[] {
    return [...this.selection];
  }

  bindList(list: HTMLElement, scroll: HTMLElement): void {
    this.release();
    this.list = list;
    this.scroll = scroll;
    list.addEventListener("dragover", this.onDragOver);
    list.addEventListener("dragleave", this.onDragLeave);
    list.addEventListener("drop", this.onDrop);
    this.selection = pruneSelection(
      this.renderedIds().map((id) => ({ id })),
      this.selection,
    );
  }

  /** Selection styling plus the `aria-pressed` state for a multi-selection. */
  decorate(row: HTMLElement, id: string): void {
    const selected = this.selection.length > 1 && this.selection.includes(id);
    row.classList.toggle("is-selected", selected);
    if (selected) row.setAttribute("aria-pressed", "true");
    else row.removeAttribute("aria-pressed");
  }

  applySelection(): void {
    for (const row of this.rows()) {
      const id = row.dataset.layerId;
      if (id) this.decorate(row, id);
    }
  }

  /** Handles a row click and reports whether the host should activate the row. */
  handleClick(event: MouseEvent, id: string): boolean {
    const mode: ListSelectMode = event.shiftKey
      ? "range"
      : event.ctrlKey || event.metaKey
        ? "toggle"
        : "replace";
    const next = selectionAfterClick(
      this.renderedIds().map((entry) => ({ id: entry })),
      this.selection,
      this.anchor,
      id,
      mode,
    );
    this.selection = next.ids;
    this.anchor = next.anchor;
    this.applySelection();
    return mode === "replace";
  }

  handleDragStart(event: DragEvent, id: string, row: HTMLElement): void {
    if (!this.options.canMove()) {
      event.preventDefault();
      return;
    }
    if (!this.selection.includes(id)) {
      this.selection = [id];
      this.anchor = id;
    }
    const entries = this.renderedIds().map((entry) => ({ id: entry }));
    this.dragging = dragSet(entries, new Set(this.selection), id);
    this.applySelection();
    row.classList.add("is-dragging");
    for (const other of this.rows()) {
      const otherId = other.dataset.layerId;
      if (other !== row && otherId && this.dragging.includes(otherId)) {
        other.classList.add("is-dragging");
      }
    }
    event.dataTransfer?.setData("text/plain", this.dragging.join("\n"));
    event.dataTransfer?.setData(this.options.mime, this.dragging.join("\n"));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  handleDragEnd(): void {
    this.clearDragState();
  }

  /**
   * Alt+arrows move within the sibling list and in or out of a group; plain
   * Left/Right close or open the focused row without moving it.
   */
  handleKeyDown(event: KeyboardEvent, id: string): void {
    if (event.ctrlKey || event.metaKey) return;
    if (!event.altKey) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const project = this.options.project();
      if (!project) return;
      const hasChildren =
        (buildLayerHierarchy(project.layers).childrenOfId.get(id) ?? []).length > 0;
      if (!hasChildren) return;
      event.preventDefault();
      this.options.setExpanded?.(id, event.key === "ArrowRight");
      this.options.requestRender?.();
      return;
    }
    if (event.key === "ArrowRight") {
      this.nestIntoPreviousSibling(event, id);
      return;
    }
    if (event.key === "ArrowLeft") {
      this.moveOutOfGroup(event, id);
      return;
    }
    const plan = this.keyboardPlan(id, event.key);
    if (!plan) return;
    event.preventDefault();
    this.run([id], plan);
  }

  /** Clears the drop chrome and restores focus after the panel re-rendered. */
  afterRender(): void {
    this.indicator.hide();
    this.clearHighlight();
    this.applySelection();
    const focus = this.pendingFocus;
    this.pendingFocus = null;
    if (!focus) return;
    for (const row of this.rows()) {
      if (row.dataset.layerId !== focus) continue;
      row.focus({ preventScroll: true });
      return;
    }
  }

  detach(): void {
    this.release();
  }

  /** Clears the selection, for example when the panel starts over. */
  reset(): void {
    this.clearDragState();
    this.release();
    this.selection = [];
    this.anchor = null;
  }

  private keyboardPlan(id: string, key: string): LayerDropPlan | null {
    if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "Home" && key !== "End") return null;
    if (!this.options.canMove()) return null;
    const siblings = this.siblingIds(id);
    const index = siblings.indexOf(id);
    if (index < 0) return null;
    if (key === "Home") {
      return index === 0 ? null : { mode: "above", targetId: siblings[0] };
    }
    if (key === "End") {
      if (index >= siblings.length - 1) return null;
      return { mode: "below", targetId: siblings[siblings.length - 1] };
    }
    if (key === "ArrowUp") {
      return index === 0 ? null : { mode: "above", targetId: siblings[index - 1] };
    }
    if (index >= siblings.length - 1) return null;
    return { mode: "below", targetId: siblings[index + 1] };
  }

  private siblingIds(layerId: string): string[] {
    const project = this.options.project();
    if (!project) return [];
    const hierarchy = buildLayerHierarchy(project.layers);
    const parentId = hierarchy.parentOfId.get(layerId) ?? null;
    const siblings = parentId ? (hierarchy.childrenOfId.get(parentId) ?? []) : hierarchy.rootIds;
    return [...siblings].reverse();
  }

  private nestIntoPreviousSibling(event: KeyboardEvent, id: string): void {
    const siblings = this.siblingIds(id);
    const index = siblings.indexOf(id);
    if (index <= 0) {
      this.announcer.announce(t("layer.nestNoSibling"));
      return;
    }
    event.preventDefault();
    this.run([id], { mode: "inside", targetId: siblings[index - 1] });
  }

  private moveOutOfGroup(event: KeyboardEvent, id: string): void {
    const project = this.options.project();
    if (!project) return;
    const parentId = buildLayerHierarchy(project.layers).parentOfId.get(id) ?? null;
    if (!parentId) {
      this.announcer.announce(t("layer.unnestNoGroup"));
      return;
    }
    event.preventDefault();
    this.run([id], { mode: "below", targetId: parentId });
  }

  private run(ids: readonly string[], plan: LayerDropPlan): void {
    const project = this.options.project();
    if (!project || !this.options.canMove()) return;
    const rejection = layerMoveRejection(project, ids, plan);
    this.pendingFocus = ids[0] ?? null;
    if (rejection) {
      this.announcer.announce(rejectionMessage(rejection));
      this.afterRender();
      return;
    }
    if (this.options.apply(ids, plan)) {
      this.selection = [...ids];
      this.anchor = ids[0] ?? null;
      this.announcer.announce(this.moveMessage(ids, plan));
    }
    this.afterRender();
  }

  private moveMessage(ids: readonly string[], plan: LayerDropPlan): string {
    const name = layerName(this.options.project(), plan.targetId);
    if (plan.mode === "inside") return t("layer.nestedInto", { count: ids.length, name });
    if (ids.length > 1) return t("layer.movedMany", { count: ids.length });
    return t("layer.movedNear", { name });
  }

  private dropLabel(preview: LayerDropPreview): string | null {
    if (preview.rejection) return rejectionMessage(preview.rejection);
    if (preview.feedback !== "nest") return null;
    return t("layer.nestInto", { name: layerName(this.options.project(), preview.plan.targetId) });
  }

  private renderedIds(): string[] {
    return this.rows()
      .map((row) => row.dataset.layerId)
      .filter((id): id is string => Boolean(id));
  }

  private rows(): HTMLElement[] {
    if (!this.list) return [];
    return [...this.list.querySelectorAll<HTMLElement>(this.options.rowSelector ?? ".layer-row")];
  }

  private handleDragOver(event: DragEvent): void {
    if (this.isFileDrag(event) || !this.dragging.length) return;
    if (!this.options.canMove() || !this.list) return;
    const project = this.options.project();
    if (!project) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const preview = layerDropPreview(
      project,
      this.dragging,
      layerRowSpans(this.rows()),
      event.clientY,
    );
    this.preview = preview;
    if (!preview) return;
    this.indicator.show(
      this.list,
      this.rows(),
      preview.insertionIndex,
      this.dropLabel(preview),
      preview.feedback === "reject",
    );
    this.setHighlight(preview.highlightId);
    this.scroller.update(this.scroll, event.clientY);
  }

  private handleDragLeave(event: DragEvent): void {
    if (!this.list) return;
    const rect = this.list.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (inside) return;
    this.indicator.hide();
    this.clearHighlight();
    this.scroller.stop();
  }

  private handleDrop(event: DragEvent): void {
    if (this.isFileDrag(event)) return;
    event.preventDefault();
    const preview = this.preview;
    const ids = [...this.dragging];
    this.clearDragState();
    if (!preview || !ids.length) return;
    if (preview.rejection) {
      this.announcer.announce(this.dropLabel(preview) ?? "");
      return;
    }
    this.run(ids, preview.plan);
  }

  private isFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  private setHighlight(id: string | null): void {
    if (this.highlight?.dataset.layerId === id) return;
    this.clearHighlight();
    if (!id) return;
    this.highlight = this.rows().find((row) => row.dataset.layerId === id) ?? null;
    this.highlight?.classList.add("is-drop-target");
  }

  private clearHighlight(): void {
    this.highlight?.classList.remove("is-drop-target");
    this.highlight = null;
  }

  private clearDragState(): void {
    this.dragging = [];
    this.preview = null;
    this.indicator.hide();
    this.clearHighlight();
    this.scroller.stop();
    for (const row of this.rows()) row.classList.remove("is-dragging");
  }

  private release(): void {
    if (this.list) {
      this.list.removeEventListener("dragover", this.onDragOver);
      this.list.removeEventListener("dragleave", this.onDragLeave);
      this.list.removeEventListener("drop", this.onDrop);
    }
    this.scroller.stop();
    this.indicator.destroy();
    this.list = null;
    this.scroll = null;
  }
}
