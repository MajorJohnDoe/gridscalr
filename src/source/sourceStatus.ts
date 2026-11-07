import { fileSize, isTauri, pathExists } from "../io/platform";
import { resolveRelativePath } from "../io/projectFile";
import type { Project } from "../model/types";
import { store } from "../state/store";

export type SourceFileState = "ok" | "missing" | "changed";

export interface SourceFileStatus {
  documentId: string;
  name: string;
  path: string | null;
  state: SourceFileState;
}

export interface SourceStatusSummary {
  checked: boolean;
  checkedAt: string | null;
  missing: number;
  changed: number;
  statuses: SourceFileStatus[];
}

const POLL_MS = 30_000;

function resolvedDocumentPath(
  document: Project["documents"][number],
  projectPath: string | null,
): string | null {
  if (document.path) return document.path;
  if (projectPath && document.relativePath) {
    return resolveRelativePath(projectPath, document.relativePath);
  }
  return null;
}

class SourceStatusMonitor {
  private statuses: SourceFileStatus[] = [];
  private checkedAt: string | null = null;
  private checking = false;
  private listeners = new Set<() => void>();
  private timer: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private focusListener: (() => void) | null = null;

  get summary(): SourceStatusSummary {
    return {
      checked: this.checkedAt !== null,
      checkedAt: this.checkedAt,
      missing: this.statuses.filter((entry) => entry.state === "missing").length,
      changed: this.statuses.filter((entry) => entry.state === "changed").length,
      statuses: this.statuses,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (!isTauri || this.timer !== null) return;
    this.unsubscribe = store.subscribe((reason) => {
      if (reason === "project") void this.refresh();
    });
    this.focusListener = () => void this.refresh();
    window.addEventListener("focus", this.focusListener);
    this.timer = window.setInterval(() => void this.refresh(), POLL_MS);
    void this.refresh();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.focusListener) window.removeEventListener("focus", this.focusListener);
    this.focusListener = null;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  async refresh(): Promise<void> {
    if (this.checking) return;
    const project = store.project;
    if (!project) {
      this.statuses = [];
      this.checkedAt = null;
      this.notify();
      return;
    }
    this.checking = true;
    try {
      const projectPath = store.projectPath;
      const next: SourceFileStatus[] = [];
      for (const document of project.documents) {
        // Embedded TIF pages need no external file.
        if (document.kind === "tiff" && document.embeddedPdf) continue;
        const path = resolvedDocumentPath(document, projectPath);
        if (!path) continue;
        if (!(await pathExists(path))) {
          next.push({ documentId: document.id, name: document.name, path, state: "missing" });
          continue;
        }
        const size = await fileSize(path);
        const state =
          document.sizeBytes && size !== null && size !== document.sizeBytes ? "changed" : "ok";
        next.push({ documentId: document.id, name: document.name, path, state });
      }
      this.statuses = next;
      this.checkedAt = new Date().toISOString();
    } finally {
      this.checking = false;
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
    // The status bar and Project settings both read this snapshot, and a store
    // pass also refreshes the document line and the persistent warning chips.
    if (store.project) store.emit("save");
  }
}

export const sourceStatus = new SourceStatusMonitor();
