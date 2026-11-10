import type { ProjectFileMetadata, ProjectFileStamp } from "../saveIntegrity";

export interface ProjectWatchOptions {
  readStamp: (path: string) => Promise<ProjectFileStamp | null>;
  readMetadata: (path: string) => Promise<ProjectFileMetadata | null>;
  getPath: () => string | null;
  getExpected: () => ProjectFileStamp | null;
  onChange: (current: ProjectFileStamp | null) => void;
  intervalMs?: number;
  isVisible?: () => boolean;
}

export interface ProjectWatcher {
  start(): void;
  stop(): void;
  reset(): void;
}

/**
 * Polls the project stamp while the window is visible. It only reports a
 * change; it never writes, reloads or blocks. A missing file is reported as a
 * change so the banner can offer Reload or dismiss.
 */
export function createProjectWatcher(options: ProjectWatchOptions): ProjectWatcher {
  const interval = options.intervalMs ?? 5_000;
  let timer: number | null = null;
  let busy = false;
  let notified: string | null = null;

  const visible = () =>
    options.isVisible
      ? options.isVisible()
      : typeof document === "undefined" || document.visibilityState === "visible";

  const check = async (): Promise<void> => {
    if (busy || !visible()) return;
    const path = options.getPath();
    const expected = options.getExpected();
    if (!path || !expected) return;
    busy = true;
    try {
      const metadata = await options.readMetadata(path).catch(() => null);
      if (
        metadata &&
        metadata.sizeBytes === expected.sizeBytes &&
        metadata.modifiedAt === expected.modifiedAt
      ) {
        notified = null;
        return;
      }
      const current = await options.readStamp(path).catch(() => null);
      const changed =
        !current ||
        current.sha256.toLowerCase() !== expected.sha256.toLowerCase() ||
        current.sizeBytes !== expected.sizeBytes;
      if (!changed) {
        notified = null;
        return;
      }
      const key = current?.sha256 ?? "missing";
      if (key === notified) return;
      notified = key;
      options.onChange(current);
    } finally {
      busy = false;
    }
  };

  return {
    start() {
      this.stop();
      timer = window.setInterval(() => void check(), interval);
    },
    stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      busy = false;
      notified = null;
    },
    reset() {
      notified = null;
    },
  };
}
