import { t } from "../../i18n";
import { logEvent } from "../diagnostics/log";
import { totalPageCount } from "../../model/documents";
import { compareProjectShape, validateProject, type ProjectIssue } from "../../model/integrity";
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
import type { BackupPorts } from "./backupController";
import { buildConflictComparison, type ConflictComparisonInfo } from "./compare";
import { classifyConflict, type ConflictAction, type VersionSummary } from "./conflict";
import { ProjectWriteConflictError } from "./files";
import { conflictedCopyPath, isNoOpSave, type ProjectFileStamp } from "./stamp";
import type { ConflictDialogInfo } from "./ui";

export interface SaveIntegrityPorts extends BackupPorts {
  desktop: boolean;
  chooseSavePath: (suggested: string) => Promise<string | null>;
  readStamp: (path: string) => Promise<ProjectFileStamp | null>;
  write: (
    path: string,
    contents: string,
    expectedSha256: string | null,
    protectedPaths: readonly string[],
  ) => Promise<ProjectFileStamp>;
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
  compare: (info: ConflictComparisonInfo) => Promise<void>;
  confirmValidationWarnings: (issues: readonly ProjectIssue[]) => Promise<boolean>;
  reportValidationErrors: (issues: readonly ProjectIssue[], project: Project) => Promise<void>;
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

interface DiskVersion {
  project: Project | null;
  summary: VersionSummary | null;
  error: boolean;
}

async function readDiskVersion(
  path: string,
  current: ProjectFileStamp | null,
  ports: SaveIntegrityPorts,
): Promise<DiskVersion> {
  if (!current) return { project: null, summary: null, error: false };
  try {
    const text = await ports.readText(path);
    const project = parseProject(text);
    return { project, summary: summarize(project, text, current), error: false };
  } catch {
    return { project: null, summary: null, error: true };
  }
}

function restoreRelativePaths(project: Project, previous: (string | null)[]): void {
  project.documents.forEach((document, index) => {
    document.relativePath = previous[index] ?? null;
  });
}

/** Checks both the current project and a parse round trip of its serialized text. */
async function validateBeforeWrite(
  project: Project,
  ports: SaveIntegrityPorts,
  json: string,
): Promise<boolean> {
  const all = validateProject(project);
  const issues = all.filter((entry) => entry.severity === "error");
  if (issues.length) {
    await ports.reportValidationErrors(all, project);
    return false;
  }
  let roundTrip: ProjectIssue[];
  try {
    const parsed = parseProject(json);
    roundTrip = [...validateProject(parsed), ...compareProjectShape(project, parsed)].filter(
      (entry) => entry.severity === "error",
    );
  } catch {
    roundTrip = [
      {
        severity: "error",
        code: "roundTripParse",
        message: "round trip parse failed",
        entity: { kind: "project" },
      },
    ];
  }
  if (roundTrip.length) {
    await ports.reportValidationErrors(roundTrip, project);
    return false;
  }
  return true;
}

async function acceptValidationWarnings(
  project: Project,
  ports: SaveIntegrityPorts,
): Promise<boolean> {
  const issues = validateProject(project);
  const errors = issues.filter((entry) => entry.severity === "error");
  if (errors.length) {
    await ports.reportValidationErrors(issues, project);
    return false;
  }
  const warnings = issues.filter((entry) => entry.severity === "warning");
  if (!warnings.length) return true;
  return ports.confirmValidationWarnings(warnings);
}

async function backupSafely(
  ports: SaveIntegrityPorts,
  projectId: string,
  contents: string,
  projectPath: string | null,
): Promise<void> {
  try {
    await ports.saveBackup(projectId, contents, projectPath, ports.backupRetention());
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
    if (!(await validateBeforeWrite(project, ports, json))) {
      restoreRelativePaths(project, previousPaths);
      return false;
    }
    const stamp = await ports.write(path, json, expectedSha256, protectedPaths);
    if (markSaved) {
      store.fileStamp = stamp;
      store.markSaved(path);
      try {
        ports.afterSave(path);
      } catch {
        // Recents are a convenience; the save is still complete.
      }
      await backupSafely(ports, project.id, previousText ?? json, path);
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
  const disk = await readDiskVersion(path, current, ports);
  const comparison = buildConflictComparison(
    project,
    local,
    disk.project,
    disk.summary,
    disk.error,
  );
  let action: ConflictAction;
  do {
    action = await ports.conflict({ targetPath: path, current, local, disk: disk.summary });
    if (action === "compare") await ports.compare(comparison);
  } while (action === "compare");

  if (action === "cancel") return false;
  if (action === "reload") {
    const text = await ports.readText(path);
    // The conflict dialog already confirmed that the in-memory version is
    // discarded, so the load must not ask the unsaved-changes prompt again.
    const wasDirty = store.dirty;
    store.dirty = false;
    let loaded = false;
    try {
      loaded = await ports.loadProjectText(text, path);
    } finally {
      if (!loaded) store.dirty = wasDirty;
    }
    return loaded;
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
    if (!(await validateBeforeWrite(project, ports, json))) {
      restoreRelativePaths(project, previousPaths);
      return false;
    }
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
  if (!(await acceptValidationWarnings(project, ports))) return false;
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
