import { fileSize, isTauri, pathExists, readFileBytes, sha256Hex } from "../io/platform";
import { resolveRelativePath } from "../io/projectFile";
import type { Project } from "../model/types";
import { store } from "../state/store";

export type SourceFileState = "ok" | "missing" | "changed";

export interface SourceFileStatus {
  documentId: string;
  name: string;
  path: string | null;
  state: SourceFileState;
  storage: "reference" | "managed";
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

/**
 * Existence, size and checksum for every external document in `project`.
 *
 * The project doctor reuses this check for a project that is not open yet, so
 * it takes the project and its path explicitly instead of reading the store.
 * `cache` is the monitor's per-path hash cache; a caller that checks once can
 * leave it out. An embedded TIF page needs no external file and is skipped.
 */
export async function checkSourceStatuses(
  project: Project,
  projectPath: string | null,
  cache?: Map<string, string>,
): Promise<SourceFileStatus[]> {
  const next: SourceFileStatus[] = [];
  for (const document of project.documents) {
    // Embedded TIF pages need no external file.
    if (document.kind === "tiff" && document.embeddedPdf) continue;
    const storage = document.storage === "managed" ? "managed" : "reference";
    const path = resolvedDocumentPath(document, projectPath);
    if (!path) continue;
    if (!(await pathExists(path))) {
      next.push({
        documentId: document.id,
        name: document.name,
        path,
        state: "missing",
        storage,
      });
      continue;
    }
    const size = await fileSize(path);
    let state: SourceFileState = "ok";
    if (document.kind === "pdf" && document.sha256) {
      const key = `${path}|${size ?? 0}|${document.sha256}`;
      let hash = cache?.get(key);
      if (!hash) {
        try {
          hash = await sha256Hex(await readFileBytes(path));
          if (cache) {
            if (cache.size > 256) cache.clear();
            cache.set(key, hash);
          }
        } catch {
          hash = undefined;
        }
      }
      if (hash && hash.toLowerCase() !== document.sha256.toLowerCase()) state = "changed";
      else if (!hash && size !== null && size !== document.sizeBytes) state = "changed";
    } else if (document.sizeBytes && size !== null && size !== document.sizeBytes) {
      state = "changed";
    }
    next.push({
      documentId: document.id,
      name: document.name,
      path,
      state,
      storage,
    });
  }
  return next;
}

class SourceStatusMonitor {
  private statuses: SourceFileStatus[] = [];
  private checkedAt: string | null = null;
  private checking = false;
  private listeners = new Set<() => void>();
  private timer: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private focusListener: (() => void) | null = null;
  /** One hash per path/size/stored-checksum so polling does not re-read files. */
  private hashCache = new Map<string, string>();

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
    this.hashCache.clear();
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
      this.statuses = await checkSourceStatuses(project, projectPath, this.hashCache);
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
