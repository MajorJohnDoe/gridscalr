import type { DroppedFile } from "./model";
import { classifyPageDrop, isFileDrag, pointInRect } from "./model";
import { pageReorder } from "../pageReorder";
import { store } from "../../state/store";

/**
 * Drops PDF/TIF files on the Pages panel. Internal card drags carry a text
 * payload and are left to `pageReorder`; only a `Files` drag reaches this
 * controller, so the two affordances cannot fight over the same listeners.
 */

export type PageDropRejection = "project" | "unsupported" | "multiple" | "readOnly";

export interface PageFileDropActions {
  /** Opens the existing add-pages flow at a 0-based insertion index. */
  addDrawing: (file: DroppedFile, insertionIndex: number) => void;
  reject: (reason: PageDropRejection, name?: string, count?: number) => void;
}

interface ClientPoint {
  x: number;
  y: number;
}

export class PageFileDropController {
  private panel: HTMLElement | null = null;

  constructor(private readonly actions: PageFileDropActions) {}

  /** Binds once to the persistent Pages-panel surface. */
  bindPanel(panel: HTMLElement): void {
    if (this.panel === panel) return;
    this.detach();
    this.panel = panel;
    panel.addEventListener("dragover", this.onDragOver);
    panel.addEventListener("dragleave", this.onDragLeave);
    panel.addEventListener("drop", this.onDrop);
  }

  detach(): void {
    const panel = this.panel;
    if (!panel) return;
    panel.removeEventListener("dragover", this.onDragOver);
    panel.removeEventListener("dragleave", this.onDragLeave);
    panel.removeEventListener("drop", this.onDrop);
    this.panel = null;
    pageReorder.hideExternalDrop();
  }

  /** Native drag-over: show the shared insertion line while a drawing is over Pages. */
  over(files: readonly DroppedFile[], point: ClientPoint): boolean {
    if (!this.pagesTarget(point)) return false;
    if (store.readOnly || classifyPageDrop(files).kind !== "drawing") {
      pageReorder.hideExternalDrop();
      return true;
    }
    pageReorder.showExternalDrop(point.y);
    return true;
  }

  leave(): void {
    pageReorder.hideExternalDrop();
  }

  /**
   * Native and DOM drop. Returns true when the Pages panel owns the drop; a
   * false return lets the window-level drop open a drawing or project normally.
   */
  drop(files: readonly DroppedFile[], point: ClientPoint): boolean {
    if (!this.pagesTarget(point)) return false;
    pageReorder.hideExternalDrop();
    if (store.readOnly) {
      this.actions.reject("readOnly");
      return true;
    }
    const decision = classifyPageDrop(files);
    if (decision.kind === "none") return false;
    if (decision.kind === "multiple") {
      this.actions.reject("multiple", undefined, decision.count);
      return true;
    }
    if (decision.kind === "project") {
      this.actions.reject("project", decision.file.name);
      return true;
    }
    if (decision.kind === "unsupported") {
      this.actions.reject("unsupported", decision.file.name);
      return true;
    }
    const insertionIndex = pageReorder.showExternalDrop(point.y);
    pageReorder.hideExternalDrop();
    this.actions.addDrawing(decision.file, insertionIndex);
    return true;
  }

  private readonly onDragOver = (event: DragEvent): void => {
    if (!this.isFileDrag(event)) return;
    if (!this.pagesTarget({ x: event.clientX, y: event.clientY })) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    if (!store.readOnly) pageReorder.showExternalDrop(event.clientY);
  };

  private readonly onDragLeave = (event: DragEvent): void => {
    const panel = this.panel;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (pointInRect({ x: event.clientX, y: event.clientY }, rect)) return;
    pageReorder.hideExternalDrop();
  };

  private readonly onDrop = (event: DragEvent): void => {
    if (!this.isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const files: DroppedFile[] = [];
    for (const file of event.dataTransfer?.files ?? []) {
      files.push({ name: file.name, path: null, file });
    }
    this.drop(files, { x: event.clientX, y: event.clientY });
  };

  private isFileDrag(event: DragEvent): boolean {
    return isFileDrag(Array.from(event.dataTransfer?.types ?? []));
  }

  private pagesTarget(point: ClientPoint): boolean {
    const panel = this.panel;
    if (!panel || !store.project || store.ui.leftTab !== "pages") return false;
    return pointInRect(point, panel.getBoundingClientRect());
  }
}
