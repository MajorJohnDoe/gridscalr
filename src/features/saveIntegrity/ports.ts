import { t } from "../../i18n";
import {
  addRecent,
  basename,
  chooseSavePath,
  isTauri,
  pathExists,
  saveTextFile,
} from "../../io/platform";
import type { ProjectIssue } from "../../model/integrity";
import type { Project } from "../../model/types";
import { messageDialog } from "../../ui/dialogs";
import { toast } from "../../ui/toast";
import type { SaveIntegrityPorts } from "./controller";
import {
  computeFileStamp,
  listProjectBackups,
  readProjectFileText,
  saveProjectBackup,
  writeProjectConditional,
} from "./files";
import { chooseBackupDialog, compareDialog, conflictDialog } from "./ui";
import { confirmProjectValidationWarnings } from "../projectIntegrity";

export interface SaveIntegrityHost {
  loadProjectText: (text: string, path: string | null) => Promise<boolean>;
  loadProjectData: (project: Project, path: string | null, dirty: boolean) => Promise<boolean>;
  openProjectDoctor?: (issues?: readonly ProjectIssue[]) => Promise<void>;
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
    chooseBackup: chooseBackupDialog,
    listBackups: listProjectBackups,
    saveBackup: async (projectId, contents) => {
      await saveProjectBackup(projectId, contents);
    },
  };
}
