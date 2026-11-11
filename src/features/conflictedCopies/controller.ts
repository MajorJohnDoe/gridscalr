import { t } from "../../i18n";
import { describeError } from "../../io/platformError";
import { parseProject, serializeProject } from "../../io/projectFile";
import type { Project } from "../../model/types";
import { store } from "../../state/store";
import { logEvent } from "../diagnostics/log";
import {
  buildConflictComparison,
  summarizeProjectVersion,
  type ConflictComparisonInfo,
  type VersionSummary,
} from "../saveIntegrity";
import type { ConflictedCopyEntry } from "./model";
import {
  conflictedCopyDeleteBlock,
  isConflictedCopyEntry,
  projectFileStem,
  sortConflictedCopiesNewestFirst,
} from "./model";
import { showConflictedCopies } from "./ui";

/** Everything the conflicted-copy flow needs from the shell and the disk. */
export interface ConflictedCopyPorts {
  desktop: boolean;
  list: (projectPath: string) => Promise<ConflictedCopyEntry[]>;
  remove: (projectPath: string, fileName: string) => Promise<void>;
  pathExists: (path: string) => Promise<boolean>;
  /** Opens a copy as its own project; it never writes the original file. */
  open: (path: string) => Promise<void>;
  readText: (path: string) => Promise<string>;
  compare: (info: ConflictComparisonInfo) => Promise<void>;
  /** Explicit single-copy delete confirmation; the default is "no". */
  confirmDelete: (entry: ConflictedCopyEntry) => Promise<boolean>;
  notify: (message: string, kind?: "info" | "success" | "warning" | "error") => void;
  notifyError: (title: string, message: string) => Promise<void> | void;
}

function fileNameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash < 0 ? path : path.slice(slash + 1);
}

/** Re-checks every desktop result against the documented name and folder. */
async function readCopies(
  ports: ConflictedCopyPorts,
  projectPath: string,
): Promise<ConflictedCopyEntry[]> {
  const entries = await ports.list(projectPath);
  return sortConflictedCopiesNewestFirst(
    entries.filter((entry) => isConflictedCopyEntry(entry, projectPath)),
  );
}

/** Read-only comparison with the project currently open in the window. */
async function compareCopy(ports: ConflictedCopyPorts, entry: ConflictedCopyEntry): Promise<void> {
  const project = store.project;
  if (!project) return;
  const local = summarizeProjectVersion(project, serializeProject(project));
  let copy: Project | null = null;
  let copySummary: VersionSummary | null = null;
  let error = false;
  try {
    const text = await ports.readText(entry.path);
    copy = parseProject(text);
    copySummary = summarizeProjectVersion(copy, text);
  } catch (readError) {
    logEvent("warn", `conflicted copy compare failed: ${describeError(readError)}`);
    error = true;
  }
  await ports.compare(buildConflictComparison(project, local, copy, copySummary, error));
}

function blockedMessage(block: "openProject" | "onlyCopy"): string {
  return block === "onlyCopy"
    ? t("conflictedCopies.guardOnlyCopy")
    : t("conflictedCopies.guardOpenProject");
}

/**
 * Lists, opens, compares and deletes the conflicted copies beside the open
 * project. Discovery and deletion stay in the Rust command; this flow never
 * deletes automatically, never deletes the open project's file and refuses to
 * remove the last surviving copy when the original project is missing.
 */
export async function openConflictedCopiesFlow(ports: ConflictedCopyPorts): Promise<boolean> {
  const projectPath = store.projectPath;
  if (!store.project) {
    ports.notify(t("conflictedCopies.noProject"), "info");
    return false;
  }
  if (!ports.desktop) {
    ports.notify(t("conflictedCopies.desktopOnly"), "info");
    return false;
  }
  if (!projectPath || !projectFileStem(projectPath)) {
    ports.notify(t("conflictedCopies.unsavedPath"), "info");
    return false;
  }
  try {
    let entries = await readCopies(ports, projectPath);
    let selectedPath = entries[0]?.path ?? null;
    for (;;) {
      const choice = await showConflictedCopies(entries, {
        selectedPath,
        projectFileName: fileNameOf(projectPath),
      });
      if (choice.action === "cancel" || !choice.entry) return false;
      const entry = choice.entry;

      if (choice.action === "open") {
        await ports.open(entry.path);
        return true;
      }

      if (choice.action === "compare") {
        await compareCopy(ports, entry);
        selectedPath = entry.path;
        entries = await readCopies(ports, projectPath);
        if (!entries.length) return false;
        continue;
      }

      const block = conflictedCopyDeleteBlock({
        fileName: entry.fileName,
        projectPath,
        projectFileExists: await ports.pathExists(projectPath),
        copyCount: entries.length,
      });
      if (block) {
        ports.notify(blockedMessage(block), "warning");
        selectedPath = entry.path;
        continue;
      }
      if (!(await ports.confirmDelete(entry))) {
        selectedPath = entry.path;
        continue;
      }
      await ports.remove(projectPath, entry.fileName);
      const remaining = await readCopies(ports, projectPath);
      if (remaining.some((item) => item.fileName === entry.fileName)) {
        ports.notify(t("conflictedCopies.deleteFailed"), "warning");
        return false;
      }
      ports.notify(t("conflictedCopies.deleted", { name: entry.fileName }), "success");
      return true;
    }
  } catch (error) {
    logEvent("error", `conflicted copies failed: ${describeError(error)}`);
    await ports.notifyError(t("conflictedCopies.listFailed"), describeError(error));
    return false;
  }
}
