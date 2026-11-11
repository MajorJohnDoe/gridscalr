import { t } from "../../i18n";
import type { PageId } from "../../model/types";
import { store } from "../../state/store";
import {
  dragSet,
  insertionIndexAt,
  keyboardInsertion,
  moveOutcome,
  orderedSelection,
  planDrop,
  pruneSelection,
  selectionAfterClick,
  type DropPlan,
  type PageMoveCommand,
  type PageOrderOutcome,
  type PageReorderEntry,
  type PageSelectMode,
} from "./model";
import { DropIndicator, LiveRegion } from "./ui";

/**
 * Page drag and keyboard reorder state for the Pages panel. The controller owns
 * the selection, the drop plan and the drop indicator; it never renders cards
 * and it never writes the project itself. A drop calls one host action so the
 * move stays one structural checkpoint.
 */

const KEY_COMMANDS: Record<string, PageMoveCommand> = {
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "home",
  End: "end",
};

export interface PageReorderActions {
  /** Applies one structural checkpoint and moves the pages. */
  reorder: (pageIds: readonly PageId[], insertionIndex: number) => void;
  goToPage: (page: number) => void;
}

function projectEntries(): PageReorderEntry[] {
  const project = store.project;
  if (!project) return [];
  return project.pages.map((page) => ({ id: page.id, documentId: page.documentId }));
}

function documentName(documentId: string | null): string {
  const project = store.project;
  if (!documentId || !project) return "";
  return project.documents.find((document) => document.id === documentId)?.name ?? "";
}

export class PageReorderController {
  private readonly indicator = new DropIndicator();
  private readonly announcer = new LiveRegion();
  private readonly onDragOver = (event: DragEvent): void => this.handleDragOver(event);
  private readonly onDragLeave = (event: DragEvent): void => this.handleDragLeave(event);
  private readonly onDrop = (event: DragEvent): void => this.handleDrop(event);
  private readonly stepScroll = (): void => this.runScroll();
  private actions: PageReorderActions | null = null;
  private list: HTMLElement | null = null;
  private scroll: HTMLElement | null = null;
  private selection: PageId[] = [];
  private anchor: PageId | null = null;
  private dragging: PageId[] = [];
  private plan: DropPlan | null = null;
  private pointerY = 0;
  private scrollSpeed = 0;
  private scrollFrame: number | null = null;
  private pendingFocus: PageId | null = null;

  setActions(actions: PageReorderActions): void {
    this.actions = actions;
  }

  /** Rebinds the drag surface; card listeners are recreated by the panel render. */
  bindList(list: HTMLElement, scroll: HTMLElement): void {
    this.releaseList();
    this.list = list;
    this.scroll = scroll;
    list.addEventListener("dragover", this.onDragOver);
    list.addEventListener("dragleave", this.onDragLeave);
    list.addEventListener("drop", this.onDrop);
    this.prune();
  }

  /** Applies selection styling and the keyboard hint to one card. */
  decorateCard(card: HTMLElement, pageId: PageId): void {
    const selected = this.selection.length > 1 && this.selection.includes(pageId);
    card.classList.toggle("is-selected", selected);
    if (selected) card.setAttribute("aria-pressed", "true");
    else card.removeAttribute("aria-pressed");
  }

  /** Handles a card click and reports whether the panel should navigate. */
  handleClick(event: MouseEvent, pageId: PageId): boolean {
    const mode: PageSelectMode = event.shiftKey
      ? "range"
      : event.ctrlKey || event.metaKey
        ? "toggle"
        : "replace";
    const next = selectionAfterClick(projectEntries(), this.selection, this.anchor, pageId, mode);
    this.selection = next.ids;
    this.anchor = next.anchor;
    this.applySelection();
    return mode !== "toggle";
  }

  handleDragStart(event: DragEvent, pageId: PageId, card: HTMLElement): void {
    if (store.readOnly) {
      event.preventDefault();
      return;
    }
    if (!this.selection.includes(pageId)) {
      this.selection = [pageId];
      this.anchor = pageId;
    }
    const pages = projectEntries();
    this.dragging = dragSet(pages, new Set(this.selection), pageId);
    this.applySelection();
    card.classList.add("is-dragging");
    for (const other of this.cards()) {
      if (other !== card && this.dragging.includes(other.dataset.pageId ?? "")) {
        other.classList.add("is-dragging");
      }
    }
    // The text payload and the custom type are the internal page-drag markers.
    // An operating-system file drop only ever carries `Files`, which the file
    // drop controller uses to keep the two gestures apart.
    event.dataTransfer?.setData("text/plain", this.dragging.join("\n"));
    event.dataTransfer?.setData("application/x-gridscalr-page-order", this.dragging.join("\n"));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  handleDragEnd(): void {
    this.clearDragState();
  }

  handleKeyDown(event: KeyboardEvent, pageId: PageId): void {
    if (!event.altKey || event.ctrlKey || event.metaKey || store.readOnly) return;
    const command = KEY_COMMANDS[event.key];
    if (!command) return;
    event.preventDefault();
    const pages = projectEntries();
    const selected = new Set(this.selection.includes(pageId) ? this.selection : [pageId]);
    const insertion = keyboardInsertion(pages, selected, command);
    if (insertion === null) return;
    const plan = planDrop(pages, selected, insertion);
    if (!plan.changesOrder) return;
    const ids = orderedSelection(pages, selected);
    const outcome = moveOutcome(pages, selected, insertion);
    this.selection = ids;
    this.anchor = pageId;
    this.pendingFocus = pageId;
    this.actions?.reorder(ids, insertion);
    this.announce(outcome);
  }

  /** Restores focus and clears drag chrome after the panel re-rendered. */
  afterRender(): void {
    this.indicator.hide();
    const focus = this.pendingFocus;
    this.pendingFocus = null;
    if (!focus) return;
    for (const card of this.cards()) {
      if (card.dataset.pageId !== focus) continue;
      card.focus({ preventScroll: true });
      return;
    }
  }

  /** Drops the drag surface when the Pages panel leaves the DOM. */
  detach(): void {
    this.releaseList();
  }

  /** Clears selection and drag state; used when the panel starts over. */
  reset(): void {
    this.clearDragState();
    this.releaseList();
    this.selection = [];
    this.anchor = null;
  }

  /**
   * Shows the same insertion line for a file drop and returns the 0-based
   * insertion index. Returns 0 when the panel has no list (an empty project).
   */
  showExternalDrop(clientY: number): number {
    const list = this.list;
    if (!list) return 0;
    const cards = this.cards();
    const spans = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    const insertionIndex = insertionIndexAt(spans, clientY);
    this.indicator.show(list, cards, insertionIndex, null);
    return insertionIndex;
  }

  /** Hides the file-drop line without disturbing an internal card drag. */
  hideExternalDrop(): void {
    if (!this.dragging.length) this.indicator.hide();
  }

  private cards(): HTMLElement[] {
    if (!this.list) return [];
    return [...this.list.querySelectorAll<HTMLElement>(".page-card")];
  }

  private applySelection(): void {
    for (const card of this.cards()) {
      const pageId = card.dataset.pageId;
      if (pageId) this.decorateCard(card, pageId);
    }
  }

  private prune(): void {
    const pages = projectEntries();
    this.selection = pruneSelection(pages, this.selection);
    if (this.anchor && !pages.some((page) => page.id === this.anchor)) this.anchor = null;
  }

  private refreshPlan(): void {
    if (!this.list || !this.dragging.length) return;
    const cards = this.cards();
    const spans = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    const insertionIndex = insertionIndexAt(spans, this.pointerY);
    const plan = planDrop(projectEntries(), new Set(this.dragging), insertionIndex);
    this.plan = plan;
    this.indicator.show(this.list, cards, insertionIndex, this.dropLabel(plan));
  }

  private dropLabel(plan: DropPlan): string | null {
    if (!plan.crossDocument) return null;
    const name = documentName(plan.targetDocumentId);
    return name ? t("page.moveToDocument", { name }) : null;
  }

  private handleDragOver(event: DragEvent): void {
    if (this.isFileDrag(event)) return;
    if (!this.dragging.length || store.readOnly) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    this.pointerY = event.clientY;
    this.refreshPlan();
    this.updateAutoScroll();
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
    this.scrollSpeed = 0;
  }

  private handleDrop(event: DragEvent): void {
    if (this.isFileDrag(event)) return;
    event.preventDefault();
    const plan = this.plan;
    const pageIds = [...this.dragging];
    this.clearDragState();
    if (!plan || !pageIds.length || store.readOnly) return;
    this.actions?.reorder(pageIds, plan.insertionIndex);
  }

  private isFileDrag(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  private clearDragState(): void {
    this.dragging = [];
    this.plan = null;
    this.indicator.hide();
    this.scrollSpeed = 0;
    for (const card of this.cards()) card.classList.remove("is-dragging");
  }

  /** Scrolls the panel while a dragged card stays near its top or bottom edge. */
  private updateAutoScroll(): void {
    const scroll = this.scroll;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const edge = 44;
    const above = rect.top + edge - this.pointerY;
    const below = this.pointerY - (rect.bottom - edge);
    if (above > 0) this.scrollSpeed = -Math.min(18, Math.ceil(above / 2) + 3);
    else if (below > 0) this.scrollSpeed = Math.min(18, Math.ceil(below / 2) + 3);
    else this.scrollSpeed = 0;
    if (
      this.scrollSpeed &&
      this.scrollFrame === null &&
      typeof requestAnimationFrame === "function"
    ) {
      this.scrollFrame = requestAnimationFrame(this.stepScroll);
    }
  }

  private runScroll(): void {
    const scroll = this.scroll;
    if (!scroll || !this.scrollSpeed) {
      this.scrollFrame = null;
      return;
    }
    scroll.scrollTop += this.scrollSpeed;
    this.refreshPlan();
    this.scrollFrame = requestAnimationFrame(this.stepScroll);
  }

  private announce(outcome: PageOrderOutcome): void {
    const position = outcome.startIndex + 1;
    const last = outcome.startIndex + outcome.count;
    this.announcer.announce(
      outcome.count > 1
        ? t("page.reorderedMany", {
            count: outcome.count,
            position,
            last,
            total: outcome.total,
          })
        : t("page.reorderedOne", { position, total: outcome.total }),
    );
  }

  private releaseList(): void {
    if (!this.list) return;
    this.list.removeEventListener("dragover", this.onDragOver);
    this.list.removeEventListener("dragleave", this.onDragLeave);
    this.list.removeEventListener("drop", this.onDrop);
    if (this.scrollFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.scrollFrame);
    }
    this.scrollFrame = null;
    this.scrollSpeed = 0;
    this.indicator.destroy();
    this.list = null;
    this.scroll = null;
  }
}
