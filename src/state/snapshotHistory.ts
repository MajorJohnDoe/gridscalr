import type { ImageAsset, Project } from "../model/types";
import { pushHistory } from "./history";
import { serializeProject } from "./snapshot";

/**
 * Undo and redo history for one project, plus the runtime image payloads that
 * the serialised history deliberately omits.
 *
 * History entries are the serialised project text. The text of the state that
 * is currently in memory is cached, so a commit pushes the previous state
 * without serialising it a second time, and undo/redo move that text between
 * the two stacks without touching the serialiser at all. A gesture captures the
 * same cached text, so a completed drag pays one serialisation (the new state)
 * rather than two.
 *
 * The cache is refreshed after every store commit, so the only states it can
 * miss are direct view or derived-data writes between commits (the active layer
 * and the rebuildable OCR index), which are not undoable project edits.
 */
export class SnapshotHistory {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private payloads = new Map<string, string>();
  private cachedText: string | null = null;
  private cachedProject: Project | null = null;
  private gestureText: string | null = null;

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get gestureOpen(): boolean {
    return this.gestureText !== null;
  }

  /** Starts a new timeline and caches the serialised current state. */
  seed(project: Project | null): void {
    this.undoStack = [];
    this.redoStack = [];
    this.gestureText = null;
    this.payloads.clear();
    this.cachedText = null;
    this.cachedProject = null;
    this.capture(project);
  }

  /** Serialises the current state once and caches the text. */
  capture(project: Project | null): string | null {
    if (!project) {
      this.cachedText = null;
      this.cachedProject = null;
      return null;
    }
    for (const asset of Object.values(project.assets ?? {})) {
      if (asset.data) this.payloads.set(asset.id, asset.data);
    }
    this.cachedText = serializeProject(project);
    this.cachedProject = project;
    return this.cachedText;
  }

  /** Text of the state now in memory; serialises only when it is unknown. */
  currentText(project: Project | null): string | null {
    if (!project) return null;
    if (this.cachedText !== null && this.cachedProject === project) return this.cachedText;
    return this.capture(project);
  }

  /** Pushes a text captured before a change that has now happened. */
  commit(text: string): void {
    pushHistory(this.undoStack, text);
    this.redoStack = [];
  }

  /** Moves the current text to redo and returns the text to restore. */
  undo(project: Project | null): string | null {
    if (!project || !this.undoStack.length) return null;
    const current = this.currentText(project);
    const previous = this.undoStack.pop() ?? null;
    if (previous !== null && current !== null) pushHistory(this.redoStack, current);
    return previous;
  }

  /** Moves the current text to undo and returns the text to restore. */
  redo(project: Project | null): string | null {
    if (!project || !this.redoStack.length) return null;
    const current = this.currentText(project);
    const next = this.redoStack.pop() ?? null;
    if (next !== null && current !== null) pushHistory(this.undoStack, current);
    return next;
  }

  /** Restores serialised state and adopts it as the cached current text. */
  restore(text: string): Project {
    const project = JSON.parse(text) as Project;
    if (!project.assets) project.assets = {};
    for (const asset of Object.values(project.assets)) {
      if (asset.data) {
        this.payloads.set(asset.id, asset.data);
      } else {
        const data = this.payloads.get(asset.id);
        if (data) asset.data = data;
      }
    }
    this.cachedText = text;
    this.cachedProject = project;
    return project;
  }

  beginGesture(project: Project | null): void {
    this.gestureText = this.currentText(project);
  }

  /**
   * Commits a changed gesture: one push and one serialisation of the new state.
   * The caller decides whether the gesture changed anything.
   */
  commitGesture(project: Project | null): void {
    const text = this.gestureText;
    this.gestureText = null;
    if (text === null) return;
    pushHistory(this.undoStack, text);
    this.redoStack = [];
    this.capture(project);
  }

  /** Aborts a gesture, returning its restored project, or null when unopened. */
  cancelGesture(project: Project | null): Project | null {
    const text = this.gestureText;
    this.gestureText = null;
    if (text === null || !project) return null;
    return this.restore(text);
  }

  /** Drops an open gesture that changed nothing. */
  discardGesture(): void {
    this.gestureText = null;
  }

  registerPayload(asset: ImageAsset): void {
    this.payloads.set(asset.id, asset.data);
  }

  /** Forgets payloads whose asset no longer exists in the project. */
  prunePayloads(project: Project | null): void {
    if (!project) {
      this.payloads.clear();
      return;
    }
    for (const id of [...this.payloads.keys()]) {
      if (!project.assets[id]) this.payloads.delete(id);
    }
  }
}
