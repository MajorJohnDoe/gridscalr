import { t } from "../../i18n";
import { store } from "../../state/store";
import { describeError } from "../../io/platformError";
import { logEvent } from "../diagnostics/log";
import {
  clearAutosavesForInstance,
  deleteRecoveryRecord,
  listRecoveryRecords,
  writeAutosaveRecord,
} from "./autosave";
import {
  autosaveIntervalMs,
  autosaveState,
  subscribeAutosaveState,
  type AutosaveState,
} from "./autosavePreference";
import { setRecoveryCenterHandler } from "./chooser";
import { appVersion, instanceId } from "./instance";
import { ProjectLeaseSession } from "./leaseSession";
import type { OpenDecision, OpenProjectInfo, SessionRecoveryHost } from "./ports";
import { collectRecoverableEntries } from "./recovery";
import type { RecoverySummary } from "./record";
import { getRecoverySummary, refreshRecoverySummary, subscribeRecoverySummary } from "./summary";
import { openRecoveryCenter } from "./centerUi";
import { needsRestoreConfirmation } from "./centerModel";
import { confirmDialog } from "../../ui/dialogs";
import { showFileChangedBanner, showReadOnlyBanner } from "./ui";
import { createProjectWatcher, type ProjectWatcher } from "./watch";

const SKIP_REASONS = new Set(["cursor", "view", "selection", "page", "tool", "save"]);

/** Smallest delay between a change and the first snapshot. */
const AUTOSAVE_DEBOUNCE_MS = 900;

/**
 * Owns the scoped autosave loop, the advisory sidecar lease, the external-change
 * watcher and the explicit recovery chooser. ProjectSession and App only call
 * this controller; the storage, lease and dialog rules stay in this module.
 */
export class SessionRecoveryController {
  readonly instanceId = instanceId();
  private readonly leases: ProjectLeaseSession;
  private unsubscribeStore: (() => void) | null = null;
  private unsubscribeSummary: (() => void) | null = null;
  private unsubscribeAutosave: (() => void) | null = null;
  private autosaveTimer: number | null = null;
  private watcher: ProjectWatcher | null = null;
  private lastAutosave: { revision: number; path: string | null } | null = null;
  private lastAutosaveAt = 0;
  private lastAutosaveError: string | null = null;
  private currentProjectId: string | null = null;
  private currentProjectPath: string | null = null;
  private removeBanner: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly host: SessionRecoveryHost) {
    this.leases = new ProjectLeaseSession(
      {
        desktop: host.desktop,
        bannerHost: host.bannerHost,
        notify: host.notify,
        onOwnershipLost: () => this.handleOwnershipLost(),
      },
      this.instanceId,
    );
  }

  start(): void {
    this.unsubscribeStore = store.subscribe((reason) => this.onStoreChange(reason));
    this.unsubscribeSummary = subscribeRecoverySummary((summary) =>
      this.host.onSummaryChange(summary),
    );
    this.unsubscribeAutosave = subscribeAutosaveState((state) =>
      this.onAutosavePreferenceChange(state),
    );
    setRecoveryCenterHandler(() => this.openCenter());
    void refreshRecoverySummary();
    this.scheduleAutosave();
  }

  summary(): RecoverySummary {
    return getRecoverySummary();
  }

  /** Runs before a project is installed. It never blocks on stale or corrupt data. */
  beforeOpen(path: string | null, project: OpenProjectInfo): Promise<OpenDecision> {
    return this.leases.beforeOpen(path, project, this.host.readStamp);
  }

  /** Adopts the lease acquired by beforeOpen and starts the watch loop. */
  async afterOpen(path: string | null, projectId: string, readOnly: boolean): Promise<void> {
    const previousProjectId = this.currentProjectId;
    this.stopWatcher();
    await this.leases.adopt(path, readOnly);
    this.currentProjectId = projectId;
    this.currentProjectPath = path;
    this.lastAutosave = null;
    this.lastAutosaveAt = 0;
    if (previousProjectId && previousProjectId !== projectId) {
      await clearAutosavesForInstance(previousProjectId, this.instanceId);
    }
    store.setReadOnly(readOnly);
    this.removeBanner?.();
    this.removeBanner = null;
    if (readOnly) {
      this.removeBanner = showReadOnlyBanner(this.host.bannerHost, {
        onSaveCopy: () => this.host.onSaveCopy(),
      });
    }
    if (this.host.desktop && path) this.startWatcher(path);
    this.scheduleAutosave();
  }

  /** Releases a lease acquired for a load that did not complete. */
  abortOpen(): void {
    this.leases.abort();
  }

  /**
   * Confirms this instance still owns the project lease. A takeover by another
   * instance turns the session read-only before any file write can happen.
   */
  async confirmWriteAccess(): Promise<boolean> {
    if (!this.host.desktop) return true;
    const owned = await this.leases.verifyOwnership();
    if (!owned) this.handleOwnershipLost();
    return owned;
  }

  async onSaved(path: string | null): Promise<void> {
    if (this.currentProjectId) {
      await clearAutosavesForInstance(this.currentProjectId, this.instanceId);
    }
    this.lastAutosave = null;
    this.lastAutosaveAt = 0;
    this.lastAutosaveError = null;
    if (path && path !== this.currentProjectPath) {
      await this.leases.moveTo(
        path,
        this.currentProjectId ?? store.project?.id ?? "",
        store.fileStamp?.sha256 ?? null,
      );
    }
    this.currentProjectPath = path;
    this.watcher?.reset();
    if (this.host.desktop && path) this.startWatcher(path);
    void refreshRecoverySummary();
  }

  async discardOpenProject(): Promise<void> {
    if (this.currentProjectId) {
      await clearAutosavesForInstance(this.currentProjectId, this.instanceId);
    }
    await this.leases.release();
    this.stopWatcher();
    this.removeBanner?.();
    this.removeBanner = null;
    this.currentProjectId = null;
    this.currentProjectPath = null;
    this.lastAutosave = null;
    this.lastAutosaveAt = 0;
    void refreshRecoverySummary();
  }

  async openCenter(): Promise<void> {
    let selectedId: string | null = null;
    for (;;) {
      const records = await listRecoveryRecords().catch((error) => {
        logEvent("warn", `recovery list failed: ${describeError(error)}`);
        return [];
      });
      const entries = await collectRecoverableEntries(records, {
        desktop: this.host.desktop,
        readStamp: this.host.readStamp,
        pathExists: this.host.pathExists,
      });
      const choice = await openRecoveryCenter(entries, { selectedId });
      if (!choice.record || choice.action === "cancel") return;
      const record = choice.record;
      if (choice.action === "delete") {
        const confirmed = await confirmDialog(
          t("recoveryCenter.deleteTitle"),
          t("recoveryCenter.deleteNote", { name: record.projectName }),
          t("recoveryCenter.deleteSelected"),
          { danger: true },
        );
        if (!confirmed) {
          selectedId = record.id;
          continue;
        }
        await deleteRecoveryRecord(record.id);
        await refreshRecoverySummary();
        const remaining = await listRecoveryRecords().catch(() => []);
        if (remaining.some((candidate) => candidate.id === record.id)) {
          this.host.notify(t("recoveryCenter.deleteFailed"), "warning");
          return;
        }
        this.host.notify(t("sessionRecovery.discarded"), "success");
        return;
      }
      const entry = entries.find((candidate) => candidate.record.id === record.id);
      if (entry && needsRestoreConfirmation(entry.state)) {
        const confirmed = await confirmDialog(
          t("recoveryCenter.restoreTitle"),
          t("recoveryCenter.restoreNote"),
          t("recoveryCenter.restoreSelected"),
        );
        if (!confirmed) {
          selectedId = record.id;
          continue;
        }
      }
      const restored = await this.host.onRestore(record);
      if (!restored) return;
      await deleteRecoveryRecord(record.id);
      await refreshRecoverySummary();
      this.host.notify(t("sessionRecovery.restored"), "success");
      return;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopAutosave();
    this.stopWatcher();
    this.removeBanner?.();
    this.removeBanner = null;
    this.leases.dispose();
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.unsubscribeSummary?.();
    this.unsubscribeSummary = null;
    this.unsubscribeAutosave?.();
    this.unsubscribeAutosave = null;
    setRecoveryCenterHandler(null);
  }

  private handleOwnershipLost(): void {
    store.setReadOnly(true);
    this.removeBanner?.();
    this.removeBanner = showReadOnlyBanner(this.host.bannerHost, {
      onSaveCopy: () => this.host.onSaveCopy(),
    });
    this.host.notify(t("sessionRecovery.readOnly.takenOver"), "warning");
  }

  private onStoreChange(reason: string): void {
    if (this.disposed) return;
    if (!store.project) {
      this.stopAutosave();
      this.stopWatcher();
      this.removeBanner?.();
      this.removeBanner = null;
      this.currentProjectId = null;
      this.currentProjectPath = null;
      this.lastAutosave = null;
      this.lastAutosaveAt = 0;
      void this.leases.release();
      void refreshRecoverySummary();
      return;
    }
    if (SKIP_REASONS.has(reason)) return;
    this.scheduleAutosave();
  }

  /**
   * A preference change takes effect immediately: disabling or pausing clears
   * the pending timer, and re-enabling schedules from the current revision.
   */
  private onAutosavePreferenceChange(state: AutosaveState): void {
    if (this.disposed) return;
    if (!state.active) {
      this.stopAutosave();
      if (store.autosaveError) store.autosaveError = null;
    } else {
      this.scheduleAutosave();
    }
    store.emit("save");
  }

  private scheduleAutosave(): void {
    this.stopAutosave();
    if (!store.project || !autosaveState().active) return;
    const now = Date.now();
    const nextSlot = this.lastAutosaveAt > 0 ? this.lastAutosaveAt + autosaveIntervalMs() : now;
    const delay = Math.max(AUTOSAVE_DEBOUNCE_MS, nextSlot - now);
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      void this.writeAutosaveNow();
    }, delay);
  }

  private stopAutosave(): void {
    if (this.autosaveTimer !== null) window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
  }

  private async writeAutosaveNow(): Promise<void> {
    const project = store.project;
    if (!project || !autosaveState().active) return;
    const revision = store.revision;
    const path = store.projectPath;
    if (this.lastAutosave?.revision === revision && this.lastAutosave.path === path) return;
    try {
      await writeAutosaveRecord({
        projectId: project.id,
        projectName: project.name,
        projectPath: path,
        instanceId: this.instanceId,
        baseFileSha256: store.fileStamp?.sha256 ?? null,
        savedAt: new Date().toISOString(),
        serialized: JSON.stringify(project),
        appVersion: appVersion(),
      });
      this.lastAutosave = { revision, path };
      this.lastAutosaveAt = Date.now();
      if (store.autosaveError) {
        store.autosaveError = null;
        store.emit("save");
      }
      this.lastAutosaveError = null;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (this.lastAutosaveError !== failure.message) {
        this.lastAutosaveError = failure.message;
        store.autosaveError = {
          message: failure.message,
          quotaExceeded: Boolean((failure as { quotaExceeded?: boolean }).quotaExceeded),
        };
        this.host.notify(failure.message, "warning");
        logEvent("warn", `autosave failed: ${failure.message}`);
        store.emit("save");
      }
    }
  }

  private startWatcher(path: string): void {
    this.stopWatcher();
    this.watcher = createProjectWatcher({
      readStamp: this.host.readStamp,
      readMetadata: this.host.readMetadata,
      getPath: () => (this.currentProjectPath === path ? path : null),
      getExpected: () => store.fileStamp,
      onChange: () => {
        this.removeBanner?.();
        this.removeBanner = showFileChangedBanner(this.host.bannerHost, {
          onReload: async () => {
            await this.host.onReload();
            this.removeBanner?.();
            this.removeBanner = null;
            this.watcher?.reset();
          },
          onDismiss: () => {
            this.removeBanner = null;
          },
        });
      },
    });
    this.watcher.start();
  }

  private stopWatcher(): void {
    this.watcher?.stop();
    this.watcher = null;
  }
}
