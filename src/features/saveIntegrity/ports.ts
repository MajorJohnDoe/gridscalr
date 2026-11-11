import { t } from "../../i18n";
import {
  addRecent,
  basename,
  chooseSavePath,
  isTauri,
  pathExists,
  pickPdf,
  saveTextFile,
} from "../../io/platform";
import { loadAppPreferences } from "../../io/appPreferences";
import type { ProjectIssue } from "../../model/integrity";
import type { Project } from "../../model/types";
import { confirmDialog, messageDialog } from "../../ui/dialogs";
import { toast } from "../../ui/toast";
import type { SaveIntegrityPorts } from "./controller";
import {
  computeFileStamp,
  deleteAllProjectBackups,
  deleteProjectBackup,
  listProjectBackups,
  readProjectFileText,
  saveProjectBackup,
  writeProjectConditional,
} from "./files";
import { compareDialog, conflictDialog } from "./ui";
import { confirmProjectValidationWarnings } from "../projectIntegrity";

export interface SaveIntegrityHost {
  loadProjectText: (text: string, path: string | null) => Promise<boolean>;
  loadProjectData: (project: Project, path: string | null, dirty: boolean) => Promise<boolean>;
  openProjectDoctor?: (issues?: readonly ProjectIssue[]) => Promise<void>;
  /** The app's unsaved-changes guard, including its Save choice. */
  confirmDiscardChanges?: (message: string) => Promise<boolean>;
}

function projectFilters(): { name: string; extensions: string[] }[] {
  return [{ name: t("app.projectFilter"), extensions: ["gridscalr"] }];
}

export function createSaveIntegrityPorts(host: SaveIntegrityHost): SaveIntegrityPorts {
  return {
    desktop: isTauri,
    chooseSavePath: (suggested) => chooseSavePath(suggested, projectFilters()),
    readStamp: (path) => computeFileStamp(path),
    write: (path, contents, expectedSha256, protectedPaths) =>
      writeProjectConditional(path, contents, expectedSha256, protectedPaths),
    pathExists,
    locateDrawing: async () => {
      const picked = await pickPdf();
      return picked ? { path: picked.path, name: picked.name } : null;
    },
    readText: readProjectFileText,
    browserSave: async (contents, filename, protectedPaths) => {
      const result = await saveTextFile(contents, filename, projectFilters(), {
        forbiddenPaths: [...protectedPaths],
      });
      return result !== null;
    },
    loadProjectText: host.loadProjectText,
    loadProjectData: host.loadProjectData,
    afterSave: (path) => {
      addRecent({
        kind: "project",
        path,
        name: basename(path),
        at: new Date().toISOString(),
      });
    },
    notify: (message, kind = "info") => toast(message, kind),
    notifyError: (title, message) => messageDialog(title, message, "warning"),
    conflict: conflictDialog,
    compare: compareDialog,
    confirmValidationWarnings: confirmProjectValidationWarnings,
    reportValidationErrors: async (issues, _project) => {
      if (host.openProjectDoctor) {
        await host.openProjectDoctor(issues);
        return;
      }
      const summary = issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.code)
        .join(", ");
      await messageDialog(t("projectIntegrity.saveBlocked.title"), summary, "warning");
    },
    backupRetention: () => loadAppPreferences().backups.retention,
    listBackups: listProjectBackups,
    saveBackup: async (projectId, contents, projectPath, retention) => {
      await saveProjectBackup(projectId, contents, projectPath, retention);
    },
    deleteBackup: deleteProjectBackup,
    deleteAllBackups: deleteAllProjectBackups,
    confirm: (title, message, confirmLabel, options) =>
      confirmDialog(title, message, confirmLabel, options),
    confirmDiscard: host.confirmDiscardChanges ?? (async () => false),
  };
}
