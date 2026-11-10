import { t } from "../../i18n";
import { logEvent } from "../diagnostics/log";
import { totalPageCount } from "../../model/documents";
import type { Project } from "../../model/types";
import { describeError } from "../../io/platformError";
import {
  parseProject,
  serializeProject,
  serializeProjectCopy,
  sourceDocumentPaths,
  suggestedProjectName,
  updateRelativeDocumentPaths,
} from "../../io/projectFile";
import { assertWritablePath } from "../../io/writeGuard";
import { store } from "../../state/store";
import type { BackupEntry } from "./backup";
import { classifyConflict, type ConflictAction, type VersionSummary } from "./conflict";
import { ProjectWriteConflictError } from "./files";
import { conflictedCopyPath, isNoOpSave, type ProjectFileStamp } from "./stamp";
import type { ConflictDialogInfo } from "./ui";

export interface SaveIntegrityPorts {
  desktop: boolean;
  chooseSavePath: (suggested: string) => Promise<string | null>;
  readStamp: (path: string) => Promise<ProjectFileStamp | null>;
  write: (
    path: string,
    contents: string,
    expectedSha256: string | null,
    protectedPaths: readonly string[],
  ) => Promise<ProjectFileStamp>;
  pathExists: (path: string) => Promise<boolean>;
  readText: (path: string) => Promise<string>;
  browserSave: (
    contents: string,
    filename: string,
    protectedPaths: readonly string[],
  ) => Promise<boolean>;
  loadProjectText: (text: string, path: string | null) => Promise<boolean>;
  loadProjectData: (project: Project, path: string | null, dirty: boolean) => Promise<boolean>;
  afterSave: (path: string) => void;
  notify: (message: string, kind?: "info" | "success" | "warning" | "error") => void;
  notifyError: (title: string, message: string) => Promise<void> | void;
  conflict: (info: ConflictDialogInfo) => Promise<ConflictAction>;
  compare: (local: VersionSummary, disk: VersionSummary | null) => Promise<void>;
  chooseBackup: (entries: BackupEntry[]) => Promise<string | null>;
  listBackups: (projectId: string) => Promise<BackupEntry[]>;
  saveBackup: (projectId: string, contents: string) => Promise<void>;
}

function textSize(contents: string): number {
  return new TextEncoder().encode(contents).byteLength;
}

function itemCount(project: Project): number {
  return project.layers.reduce((total, layer) => total + layer.items.length, 0);
}

function summarize(
  project: Project,
  contents: string,
  stamp: ProjectFileStamp | null,
): VersionSummary {
  return {
    name: project.name,
    pages: totalPageCount(project.documents),
    items: itemCount(project),
    sizeBytes: textSize(contents),
    updatedAt: project.updatedAt || null,
    sha256: stamp?.sha256,
    modifiedAt: stamp?.modifiedAt,
  };
}

function summarizeDisk(text: string, stamp: ProjectFileStamp | null): VersionSummary | null {
  try {
    return summarize(parseProject(text), text, stamp);
  } catch {
    return null;
  }
}

function restoreRelativePaths(project: Project, previous: (string | null)[]): void {
  project.documents.forEach((document, index) => {
    document.relativePath = previous[index] ?? null;
  });
}

async function backupSafely(
  ports: SaveIntegrityPorts,
  projectId: string,
  contents: string,
): Promise<void> {
  try {
    await ports.saveBackup(projectId, contents);
  } catch (error) {
    logEvent("warn", `automatic backup failed: ${describeError(error)}`);
  }
}

async function writeSuccessfully(
  project: Project,
  path: string,
  expectedSha256: string | null,
  ports: SaveIntegrityPorts,
  protectedPaths: readonly string[],
  markSaved: boolean,
): Promise<boolean> {
  const previousPaths = project.documents.map((document) => document.relativePath);
  let previousText: string | null = null;
  if (markSaved) {
    try {
      previousText = await ports.readText(path);
    } catch {
      previousText = null;
    }
  }
  try {
    updateRelativeDocumentPaths(project, path);
    const json = serializeProject(project);
    const stamp = await ports.write(path, json, expectedSha256, protectedPaths);
    if (markSaved) {
      store.fileStamp = stamp;
      store.markSaved(path);
      try {
        ports.afterSave(path);
      } catch {
        // Recents are a convenience; the save is still complete.
      }
      await backupSafely(ports, project.id, previousText ?? json);
      ports.notify(t("app.projectSaved"), "success");
    }
    return true;
  } catch (error) {
    restoreRelativePaths(project, previousPaths);
    throw error;
  }
}

async function saveConflictedCopy(
  project: Project,
  targetPath: string,
  ports: SaveIntegrityPorts,
  protectedPaths: readonly string[],
): Promise<boolean> {
  const now = new Date();
  let copyPath = conflictedCopyPath(targetPath, now);
  let attempt = 1;
  while (await ports.pathExists(copyPath)) {
    attempt += 1;
    copyPath = conflictedCopyPath(targetPath, now, attempt);
  }
  const json = serializeProjectCopy(project, copyPath);
  await ports.write(copyPath, json, null, protectedPaths);
  ports.notify(t("saveIntegrity.conflictedCopySaved", { path: copyPath }), "success");
  return true;
}

async function resolveConflict(
  project: Project,
  path: string,
  current: ProjectFileStamp | null,
  ports: SaveIntegrityPorts,
  protectedPaths: readonly string[],
): Promise<boolean> {
  const localJson = serializeProjectCopy(project, path);
  // The in-memory version has no file hash yet; show its data summary only.
  const local = summarize(project, localJson, null);
  let disk: VersionSummary | null = null;
  if (current) {
    try {
      disk = summarizeDisk(await ports.readText(path), current);
    } catch {
      disk = null;
    }
  }
  let action: ConflictAction;
  do {
    action = await ports.conflict({ targetPath: path, current, local, disk });
    if (action === "compare") await ports.compare(local, disk);
  } while (action === "compare");

  if (action === "cancel") return false;
  if (action === "reload") {
    const text = await ports.readText(path);
    return ports.loadProjectText(text, path);
  }
  if (action === "overwrite") {
    return writeSuccessfully(project, path, null, ports, protectedPaths, true);
  }
  return saveConflictedCopy(project, path, ports, protectedPaths);
}

async function saveInBrowser(
  project: Project,
  ports: SaveIntegrityPorts,
  protectedPaths: readonly string[],
): Promise<boolean> {
  const previousPaths = project.documents.map((document) => document.relativePath);
  try {
    updateRelativeDocumentPaths(project, null);
    const json = serializeProject(project);
    // Validate the payload before handing it to the download fallback. The
    // browser has no path, so it can never claim a conditional write.
    parseProject(json);
    if (!(await ports.browserSave(json, suggestedProjectName(project), protectedPaths))) {
      restoreRelativePaths(project, previousPaths);
      return false;
    }
    store.fileStamp = null;
    store.markSaved(null);
    ports.notify(t("app.projectDownloaded"), "success");
    return true;
  } catch (error) {
    restoreRelativePaths(project, previousPaths);
    throw error;
  }
}

export async function saveProjectWithIntegrity(
  ports: SaveIntegrityPorts,
  saveAs: boolean,
): Promise<boolean> {
  const project = store.project;
  if (!project) return false;
  if (isNoOpSave(store.dirty, saveAs, Boolean(store.projectPath))) {
    ports.notify(t("saveIntegrity.noChanges"), "info");
    return true;
  }
  const protectedPaths = sourceDocumentPaths(project, store.projectPath);
  try {
    if (!ports.desktop) return await saveInBrowser(project, ports, protectedPaths);

    let path = store.projectPath;
    let isSaveAs = saveAs;
    if (saveAs || !path) {
      const chosen = await ports.chooseSavePath(suggestedProjectName(project));
      if (!chosen) return false;
      path = chosen;
      isSaveAs = true;
    }
    assertWritablePath(path, protectedPaths);
    const expected = isSaveAs ? null : store.fileStamp;
    const current = await ports.readStamp(path);
    if (!isSaveAs && classifyConflict(expected, current) !== "clean") {
      return resolveConflict(project, path, current, ports, protectedPaths);
    }
    try {
      return await writeSuccessfully(
        project,
        path,
        expected?.sha256 ?? null,
        ports,
        protectedPaths,
        true,
      );
    } catch (error) {
      if (error instanceof ProjectWriteConflictError) {
        return resolveConflict(project, path, error.current, ports, protectedPaths);
      }
      throw error;
    }
  } catch (error) {
    logEvent("error", `save failed: ${describeError(error)}`);
    await ports.notifyError(t("app.couldNotSaveProject"), describeError(error));
    return false;
  }
}

export async function backupProjectNow(ports: SaveIntegrityPorts): Promise<boolean> {
  const project = store.project;
  if (!project) return false;
  if (!ports.desktop) {
    ports.notify(t("saveIntegrity.desktopOnly"), "info");
    return false;
  }
  try {
    await ports.saveBackup(project.id, serializeProject(project));
    ports.notify(t("saveIntegrity.backupSaved"), "success");
    return true;
  } catch (error) {
    logEvent("error", `manual backup failed: ${describeError(error)}`);
    await ports.notifyError(t("saveIntegrity.backupFailed"), describeError(error));
    return false;
  }
}

export async function restoreProjectBackup(ports: SaveIntegrityPorts): Promise<boolean> {
  const project = store.project;
  if (!project) return false;
  if (!ports.desktop) {
    ports.notify(t("saveIntegrity.desktopOnly"), "info");
    return false;
  }
  try {
    const entries = await ports.listBackups(project.id);
    if (!entries.length) {
      ports.notify(t("saveIntegrity.noBackups"), "info");
      return false;
    }
    const path = await ports.chooseBackup(entries);
    if (!path) return false;
    const restored = parseProject(await ports.readText(path));
    // A backup opens as an unsaved copy so the current project file is never
    // changed by restoring an older version.
    const loaded = await ports.loadProjectData(restored, null, true);
    if (loaded) ports.notify(t("saveIntegrity.backupRestored"), "success");
    return loaded;
  } catch (error) {
    logEvent("error", `restore backup failed: ${describeError(error)}`);
    await ports.notifyError(t("saveIntegrity.restoreFailed"), describeError(error));
    return false;
  }
}
