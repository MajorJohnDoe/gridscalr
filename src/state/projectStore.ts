import { findItem } from "../model/layers";
import { currentPageId, pageNumber } from "../model/pages";
import type { ImageAsset, PageId, Project } from "../model/types";
import type { SessionStore } from "./sessionStore";
import { SnapshotHistory } from "./snapshotHistory";
import type { AutosaveFailure, ChangeReason, FileStamp } from "./types";

type Listener = (reason: ChangeReason) => void;

/** Callbacks the project store needs from its owner. */
export interface ProjectStoreHost {
  /** Session state is read for the page and selection cleanup after undo/redo. */
  session: SessionStore;
  /** Optional performance marker for undo and redo. */
  mark?: (name: "undo" | "redo") => void;
}

/**
 * Project data, its file identity and the undo history.
 *
 * Everything that changes the project belongs here: loading and unloading a
 * project, conditional mutation, gestures, undo/redo and the dirty flag. Session
 * and UI state live in `SessionStore`; the two are joined by the `Store` facade,
 * which is the only module that wires their notifications together.
 */
export class ProjectStore {
  project: Project | null = null;
  projectPath: string | null = null;
  /** Expected disk state captured on open and after a verified save. */
  fileStamp: FileStamp | null = null;
  dirty = false;
  /**
   * View-only: inspection, export, package and Save a copy work, but no command
   * may change project data.
   */
  readOnly = false;
  /** Last recovery-snapshot error, consumed by the UI after an autosave attempt. */
  autosaveError: AutosaveFailure | null = null;
  /** Increments whenever project data changes, including undo and redo. */
  revision = 0;
  /**
   * Monotonic project-session identity. It changes only when a project is
   * installed or unloaded, never on an edit, gesture cancel, undo or redo, so
   * session UI (the open-pages tabs) can tell a real open from a replaced
   * project object.
   */
  private loadId = 0;
  private listeners = new Set<Listener>();
  private history = new SnapshotHistory();
  /** Project revision captured when the open gesture started. */
  private gestureRevision = 0;
  private readonly session: SessionStore;
  private readonly mark?: (name: "undo" | "redo") => void;

  constructor({ session, mark }: ProjectStoreHost) {
    this.session = session;
    this.mark = mark;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(reason: ChangeReason): void {
    for (const listener of this.listeners) listener(reason);
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** Stable identity of the installed project session; see `loadId`. */
  get projectLoadId(): number {
    return this.loadId;
  }

  /**
   * Installs a project and starts a new history timeline. The caller owns the
   * session reset and the single notification, so opening stays one render.
   */
  loadProject(project: Project, projectPath: string | null, dirty = false): void {
    this.loadId += 1;
    this.project = project;
    this.projectPath = projectPath;
    this.fileStamp = null;
    this.dirty = dirty;
    this.readOnly = false;
    this.autosaveError = null;
    this.revision += 1;
    if (!project.assets) project.assets = {};
    this.clearHistory();
  }

  /** Clears project data and history. The caller resets the session and emits. */
  unloadProject(): void {
    this.loadId += 1;
    this.project = null;
    this.projectPath = null;
    this.fileStamp = null;
    this.dirty = false;
    this.readOnly = false;
    this.autosaveError = null;
    this.revision += 1;
    this.clearHistory();
  }

  setReadOnly(readOnly: boolean): void {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    this.emit("save");
  }

  /**
   * Clears undo and redo at an explicit structural boundary such as a page
   * delete, a duplicate, a document import or a source-storage change. A
   * snapshot from before the boundary cannot describe the new page or source
   * structure. Page reorder and page insert are undoable and never call this.
   */
  clearHistory(): void {
    this.history.seed(this.project);
  }

  /** Applies a project edit as one undo step and one notification. */
  mutate(
    mutator: (project: Project) => void,
    reason: ChangeReason = "change",
    options: { history?: boolean; dirty?: boolean } = {},
  ): void {
    if (!this.project || this.readOnly) return;
    const history = options.history !== false;
    const before = history ? this.history.currentText(this.project) : null;
    mutator(this.project);
    if (before) this.history.commit(before);
    this.history.capture(this.project);
    this.revision += 1;
    if (options.dirty !== false) this.dirty = true;
    this.emit(reason);
  }

  /**
   * Applies a change that becomes an undo step only when it reports a write.
   * Page-list edits use this so a drop that changes nothing adds no empty step.
   * `afterChange` runs before the notification, so a listener sees the new page.
   */
  mutateIfChanged(
    change: (project: Project) => boolean,
    reason: ChangeReason = "change",
    afterChange?: (project: Project) => void,
  ): boolean {
    if (!this.project || this.readOnly) return false;
    const before = this.history.currentText(this.project);
    if (!before) return false;
    if (!change(this.project)) return false;
    this.history.commit(before);
    this.history.capture(this.project);
    this.dirty = true;
    this.revision += 1;
    afterChange?.(this.project);
    this.emit(reason);
    return true;
  }

  /** Keeps embedded image payloads available across undo and redo. */
  registerImageAsset(asset: ImageAsset): void {
    if (this.readOnly) return;
    this.history.registerPayload(asset);
  }

  /** Forgets payloads whose asset no longer exists in the project. */
  prunePayloads(): void {
    this.history.prunePayloads(this.project);
  }

  beginGesture(): void {
    if (!this.project || this.readOnly) return;
    this.history.beginGesture(this.project);
    this.gestureRevision = this.revision;
  }

  /**
   * Records a direct project edit made while a gesture is open. Drags change
   * items in place, so this bumps the revision once and `endGesture()` compares
   * that counter instead of serialising the project a second time.
   */
  noteGestureChange(): void {
    if (!this.history.gestureOpen) return;
    if (this.revision === this.gestureRevision) this.revision += 1;
  }

  endGesture(reason: ChangeReason = "change"): void {
    if (!this.history.gestureOpen) return;
    if (this.revision !== this.gestureRevision && this.project) {
      // The direct edit already bumped the revision when the pointer moved, so
      // committing the gesture does not bump it again.
      this.history.commitGesture(this.project);
      this.dirty = true;
      this.emit(reason);
    } else {
      this.history.discardGesture();
    }
  }

  cancelGesture(): void {
    const restored = this.history.cancelGesture(this.project);
    if (restored) {
      this.project = restored;
      this.revision += 1;
    }
  }

  undo(): void {
    if (this.readOnly || !this.project || !this.history.canUndo) return;
    this.mark?.("undo");
    const visiblePageId = currentPageId(this.project, this.session.ui.page);
    const previous = this.history.undo(this.project);
    if (!previous) return;
    this.project = this.history.restore(previous);
    this.afterHistoryRestore(visiblePageId);
    this.emit("undo");
  }

  redo(): void {
    if (this.readOnly || !this.project || !this.history.canRedo) return;
    this.mark?.("redo");
    const visiblePageId = currentPageId(this.project, this.session.ui.page);
    const next = this.history.redo(this.project);
    if (!next) return;
    this.project = this.history.restore(next);
    this.afterHistoryRestore(visiblePageId);
    this.emit("undo");
  }

  markSaved(path: string | null): void {
    this.projectPath = path;
    this.dirty = false;
    this.emit("save");
  }

  /**
   * Restores view state after undo or redo. The visible page follows its
   * `PageId` while that page still exists, so undoing a reorder or a page
   * insert keeps the same drawing on screen. When the page is gone, the display
   * position is clamped instead. Display numbers are never stored references.
   */
  private afterHistoryRestore(visiblePageId: PageId | null): void {
    if (!this.project) return;
    this.revision += 1;
    this.dirty = true;
    const followed = visiblePageId ? pageNumber(this.project, visiblePageId) : 0;
    this.session.ui.page =
      followed > 0
        ? followed
        : Math.max(1, Math.min(Math.max(1, this.project.pages.length), this.session.ui.page));
    this.session.ui.selection = this.session.ui.selection.filter((ref) => {
      const found = findItem(this.project!, ref.itemId);
      return Boolean(found && found.layer.id === ref.layerId);
    });
    if (!this.project.layers.some((layer) => layer.id === this.project!.activeLayerId)) {
      this.project.activeLayerId = this.project.layers[0]?.id ?? "";
    }
  }
}
