import { t } from "../i18n";
import type { Project, RecentEntry } from "../model/types";
import {
  addRecent,
  basename,
  chooseSavePath,
  isTauri,
  pickDrawing,
  pickProject,
  readFileBytes,
  readFileText,
  saveTextFile,
  writeTextFile,
} from "../io/platform";
import {
  parseProject,
  serializeProject,
  serializeProjectCopy,
  sourceDocumentPaths,
  suggestedProjectName,
} from "../io/projectFile";
import { assertWritablePath } from "../io/writeGuard";
import { describeError } from "../io/platformError";
import { logEvent } from "../features/diagnostics/log";
import {
  chooseProjectSource,
  type SheetSourceChoice,
} from "../features/schematics/ui/sheetSourceDialog";
import { messageDialog, unsavedChangesDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import { store } from "../state/store";
import { classifyOpenTarget } from "./openTarget";
import { classifyLaunchPath, firstLaunchPath } from "../features/launch/model";
import {
  backupProjectNow,
  computeFileStamp,
  createSaveIntegrityPorts,
  restoreProjectBackup,
  saveProjectWithIntegrity,
} from "../features/saveIntegrity";

export interface ProjectSessionHost {
  resetProject(): Promise<void>;
  loadNewPdf(bytes: Uint8Array, name: string, path: string | null): Promise<void>;
  loadProjectText(text: string, projectPath: string | null): Promise<boolean>;
  loadProjectData(project: Project, projectPath: string | null, dirty: boolean): Promise<boolean>;
  createSheetProject(choice: SheetSourceChoice): Promise<void>;
}

function projectFilters() {
  return [{ name: t("app.projectFilter"), extensions: ["gridscalr"] }];
}

/**
 * Project lifecycle: new, open, save, save a copy, close, quit, recent files,
 * launched paths and drag-and-drop. App.ts owns the renderer and canvas; this
 * controller calls back into it only when a document set must be installed.
 */
export class ProjectSession {
  private unlistenClose: (() => void) | null = null;
  private unlistenLaunch: (() => void) | null = null;
  private closeInProgress = false;

  constructor(private readonly host: ProjectSessionHost) {}

  async newProjectFlow(): Promise<void> {
    let sheetChoice = false;
    try {
      const choice = await chooseProjectSource("new");
      if (!choice) return;
      sheetChoice = choice.kind === "sheet";

      if (choice.kind === "pdf") {
        const picked = await pickDrawing();
        if (!picked) return;
        if (!(await this.confirmUnsavedChanges(t("app.newProjectReplace")))) {
          return;
        }
        await this.host.resetProject();
        await this.host.loadNewPdf(picked.bytes, picked.name, picked.path);
        return;
      }

      if (!(await this.confirmUnsavedChanges(t("app.newProjectReplace")))) {
        return;
      }
      await this.host.resetProject();
      await this.host.createSheetProject(choice);
    } catch (error) {
      logEvent("error", `new project failed: ${describeError(error)}`);
      await messageDialog(
        sheetChoice ? t("sheet.createFailed") : t("app.couldNotOpenDrawing"),
        describeError(error),
        "warning",
      );
    }
  }

  async openPdfFlow(): Promise<void> {
    try {
      const picked = await pickDrawing();
      if (!picked) return;
      await this.host.loadNewPdf(picked.bytes, picked.name, picked.path);
    } catch (error) {
      logEvent("error", `open drawing failed: ${describeError(error)}`);
      await messageDialog(t("app.couldNotOpenDrawing"), describeError(error), "warning");
    }
  }

  async openProjectFlow(): Promise<void> {
    try {
      const picked = await pickProject();
      if (!picked) return;
      await this.loadProjectTextWithStamp(picked.text, picked.path);
    } catch (error) {
      logEvent("error", `open project failed: ${describeError(error)}`);
      await messageDialog(t("app.couldNotOpenProject"), describeError(error), "warning");
    }
  }

  async closeProjectFlow(): Promise<void> {
    if (!(await this.confirmUnsavedChanges(t("app.closeProjectDiscard")))) {
      return;
    }
    await this.host.resetProject();
    toast(t("app.projectClosed"), "info");
  }

  async quitFlow(): Promise<void> {
    if (!(await this.confirmUnsavedChanges(t("app.quitDiscard")))) {
      return;
    }
    await store.clearAutosave();
    if (!isTauri) {
      window.close();
      toast(t("app.closeBrowserTab"), "info");
      return;
    }
    await this.destroyWindow(t("app.windowCloseFailed"));
  }

  async bindWindowClose(): Promise<void> {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      this.unlistenClose = await win.onCloseRequested(async (event) => {
        // Always take over the close, then decide explicitly. The Tauri close API
        // would otherwise destroy the window itself, which needs its own permission
        // and gives no feedback if it fails.
        event.preventDefault();
        if (this.closeInProgress) return;
        this.closeInProgress = true;
        try {
          if (!(await this.confirmUnsavedChanges(t("app.closeAppDiscard")))) {
            return;
          }
          await store.clearAutosave();
          await this.destroyWindow(t("app.windowCloseFailed"));
        } finally {
          this.closeInProgress = false;
        }
      });
    } catch {
      // The title-bar close still works; only the unsaved-change prompt is unavailable.
    }
  }

  async confirmUnsavedChanges(message: string): Promise<boolean> {
    if (!store.project || !store.dirty) return true;
    const choice = await unsavedChangesDialog(message);
    if (choice === "cancel") return false;
    if (choice === "discard") return true;
    return this.saveProject(false);
  }

  async saveProject(saveAs: boolean): Promise<boolean> {
    return saveProjectWithIntegrity(this.savePorts(), saveAs);
  }

  async backupNowFlow(): Promise<boolean> {
    return backupProjectNow(this.savePorts());
  }

  async restoreBackupFlow(): Promise<boolean> {
    return restoreProjectBackup(this.savePorts());
  }

  private savePorts() {
    return createSaveIntegrityPorts({
      loadProjectText: (text, path) => this.loadProjectTextWithStamp(text, path),
      loadProjectData: (project, path, dirty) =>
        this.loadProjectDataWithStamp(project, path, dirty),
    });
  }

  private async loadProjectDataWithStamp(
    project: Project,
    path: string | null,
    dirty: boolean,
  ): Promise<boolean> {
    const loaded = await this.host.loadProjectData(project, path, dirty);
    if (!loaded) return false;
    await this.captureStamp(path);
    return true;
  }

  private async captureStamp(path: string | null): Promise<void> {
    if (!path || !isTauri) {
      store.fileStamp = null;
      return;
    }
    try {
      store.fileStamp = await computeFileStamp(path);
    } catch (error) {
      store.fileStamp = null;
      logEvent("warn", `project stamp failed: ${describeError(error)}`);
    }
  }

  /** Loads a project and captures the disk version it was loaded from. */
  private async loadProjectTextWithStamp(text: string, path: string | null): Promise<boolean> {
    const loaded = await this.host.loadProjectText(text, path);
    if (!loaded) return false;
    await this.captureStamp(path);
    return true;
  }

  /**
   * Writes a backup copy without changing the open project's path or its saved
   * state. Document links in the copy are relative to the copy's folder so the
   * backup stays usable if the original project is moved or replaced.
   */
  async saveProjectCopy(): Promise<boolean> {
    const project = store.project;
    if (!project) return false;
    try {
      const protectedPaths = sourceDocumentPaths(project, store.projectPath);
      const suggested = suggestedProjectName(project).replace(/\.gridscalr$/i, "-copy.gridscalr");
      if (!isTauri) {
        const result = await saveTextFile(serializeProject(project), suggested, projectFilters(), {
          forbiddenPaths: protectedPaths,
        });
        if (!result) return false;
        toast(t("app.copyDownloaded"), "success");
        return true;
      }

      const path = await chooseSavePath(suggested, projectFilters());
      if (!path) return false;
      assertWritablePath(path, protectedPaths);
      const json = serializeProjectCopy(project, path);
      await writeTextFile(path, json, { forbiddenPaths: protectedPaths });
      addRecent({
        kind: "project",
        path,
        name: basename(path),
        at: new Date().toISOString(),
      });
      toast(t("app.copySavedTo", { path: basename(path) }), "success");
      return true;
    } catch (error) {
      logEvent("error", `save copy failed: ${describeError(error)}`);
      await messageDialog(t("app.couldNotSaveCopy"), describeError(error), "warning");
      return false;
    }
  }

  async restoreAutosave(): Promise<void> {
    const payload = await store.readAutosave();
    if (!payload) {
      toast(t("app.noRecovery"), "info");
      return;
    }
    let project: Project;
    try {
      project = parseProject(JSON.stringify(payload.project));
    } catch (error) {
      logEvent("error", `restore session failed: ${describeError(error)}`);
      await messageDialog(t("app.couldNotRestoreSession"), describeError(error), "warning");
      return;
    }
    await this.loadProjectDataWithStamp(project, payload.projectPath, true);
  }

  async openRecent(entry: RecentEntry): Promise<void> {
    if (!isTauri) {
      toast(t("app.recentDesktopOnly"), "info");
      return;
    }
    try {
      if (entry.kind === "pdf") {
        const bytes = await readFileBytes(entry.path);
        await this.host.loadNewPdf(bytes, entry.name, entry.path);
      } else {
        const text = await readFileText(entry.path);
        await this.loadProjectTextWithStamp(text, entry.path);
      }
    } catch (error) {
      logEvent("error", `open recent failed: ${describeError(error)}`);
      await messageDialog(t("app.couldNotOpenRecent"), describeError(error), "warning");
    }
  }

  async openPath(path: string, failureTitle = t("app.couldNotOpenDropped")): Promise<void> {
    const target = classifyOpenTarget(path);
    try {
      if (target === "drawing") {
        const bytes = await readFileBytes(path);
        await this.host.loadNewPdf(bytes, basename(path), path);
      } else if (target === "project") {
        const text = await readFileText(path);
        await this.loadProjectTextWithStamp(text, path);
      } else {
        toast(t("app.dropHint"), "warning");
      }
    } catch (error) {
      logEvent("error", `open file failed: ${describeError(error)}`);
      await messageDialog(failureTitle, describeError(error), "warning");
    }
  }

  /**
   * Copies the bundled demo into the app data folder and opens it from there,
   * so the demo can be measured, edited and saved without touching the
   * installation directory or the bundled fixture.
   */
  async openDemoProjectFlow(): Promise<void> {
    if (!isTauri) {
      toast(t("welcome.demoUnavailable"), "info");
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("prepare_demo_project");
      await this.openPath(path, t("welcome.demoFailed"));
    } catch (error) {
      logEvent("error", `demo failed: ${describeError(error)}`);
      await messageDialog(t("welcome.demoFailed"), describeError(error), "warning");
    }
  }

  private async destroyWindow(failureMessage: string): Promise<void> {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      // destroy() bypasses the close-requested event, so closing cannot re-enter
      // the unsaved-change prompt.
      await getCurrentWindow().destroy();
    } catch {
      toast(failureMessage, "warning");
    }
  }

  /**
   * Consumes files handed over by the operating system: start arguments, a
   * Finder open event, or a second launch that the single-instance callback
   * forwarded. Only the first supported path opens; GridScalr keeps one project
   * per window.
   */
  async bindLaunchFiles(): Promise<void> {
    if (!isTauri) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      const consume = async (): Promise<void> => {
        try {
          const paths = await invoke<string[]>("take_launch_paths");
          if (!paths.length) return;
          const path = firstLaunchPath(paths);
          if (!path) {
            await messageDialog(t("launch.nothingTitle"), t("launch.nothingMessage"), "warning");
            return;
          }
          const supported = paths.filter((entry) => classifyLaunchPath(entry) !== "unknown");
          if (supported.length > 1) {
            toast(t("launch.oneFile"), "info");
          }
          await this.openPath(path, t("app.couldNotOpenOsFile"));
        } catch {
          // A failed launch read must not break the running session.
        }
      };
      this.unlistenLaunch = await listen("gridscalr:paths-queued", () => void consume());
      await consume();
    } catch {
      // The OS integration is optional; File → Open still works.
    }
  }

  async openDroppedFile(file: File): Promise<void> {
    try {
      const target = classifyOpenTarget(file.name);
      if (target === "drawing") {
        await this.host.loadNewPdf(new Uint8Array(await file.arrayBuffer()), file.name, null);
      } else if (target === "project") {
        await this.loadProjectTextWithStamp(await file.text(), null);
      } else {
        toast(t("app.dropHint"), "warning");
      }
    } catch (error) {
      logEvent("error", `dropped file failed: ${describeError(error)}`);
      await messageDialog(t("app.couldNotOpenDropped"), describeError(error), "warning");
    }
  }

  async setupDragDrop(): Promise<void> {
    if (isTauri) {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload as { type: string; paths?: string[] };
          if (payload.type === "drop" && payload.paths?.length) {
            void this.openPath(payload.paths[0]);
          }
        });
      } catch (error) {
        console.warn(t("app.nativeDragUnavailable"), error);
      }
      return;
    }
    window.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    window.addEventListener("drop", (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) void this.openDroppedFile(file);
    });
  }

  dispose(): void {
    this.unlistenClose?.();
    this.unlistenClose = null;
    this.unlistenLaunch?.();
    this.unlistenLaunch = null;
  }
}
