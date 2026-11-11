import { t } from "../../i18n";
import { describeError } from "../../io/platformError";
import type { ProjectFileStamp } from "../saveIntegrity";
import { logEvent } from "../diagnostics/log";
import { appVersion, hostLabel } from "./instance";
import {
  LEASE_HEARTBEAT_MS,
  canTakeOver,
  classifyLease,
  createLease,
  type ProjectLease,
} from "./lease";
import {
  LeaseOwnedElsewhereError,
  clearProjectLease,
  heartbeatProjectLease,
  readProjectLease,
  writeProjectLease,
} from "./leaseFiles";
import type { OpenDecision, OpenProjectInfo } from "./ports";
import { leaseConflictDialog, showStaleLeaseBanner } from "./ui";

export interface LeaseSessionHost {
  desktop: boolean;
  bannerHost: HTMLElement;
  notify: (message: string, kind?: "info" | "success" | "warning" | "error") => void;
  onOwnershipLost: () => void;
}

/**
 * The sidecar lease lifecycle for one session: read before open, acquire or
 * take over, heartbeat, and release only when this instance owns the file.
 */
export class ProjectLeaseSession {
  private lease: ProjectLease | null = null;
  private leasePath: string | null = null;
  private pending: ProjectLease | null = null;
  private pendingPath: string | null = null;
  private heartbeatTimer: number | null = null;
  private removeStaleBanner: (() => void) | null = null;

  constructor(
    private readonly host: LeaseSessionHost,
    private readonly instanceId: string,
  ) {}

  async beforeOpen(
    path: string | null,
    project: OpenProjectInfo,
    readStamp: (path: string) => Promise<ProjectFileStamp | null>,
  ): Promise<OpenDecision> {
    this.removeStaleBanner?.();
    this.removeStaleBanner = null;
    if (!this.host.desktop || !path) return { proceed: true, readOnly: false };

    const read = await readProjectLease(path);
    const state = classifyLease(read, this.instanceId);
    if (state === "liveOther" && read.lease) {
      const choice = await leaseConflictDialog(read.lease, project.name);
      if (choice === "cancel") return { proceed: false, readOnly: false };
      if (choice === "readOnly") return { proceed: true, readOnly: true };
    }
    if (state === "corrupt") this.host.notify(t("sessionRecovery.corruptLease"), "info");

    const stamp = await readStamp(path).catch(() => null);
    if (state === "staleOther" && read.lease) {
      const stale = read.lease;
      this.removeStaleBanner = showStaleLeaseBanner(this.host.bannerHost, stale, async () => {
        const cleared = await clearProjectLease(path, stale.instanceId);
        this.removeStaleBanner?.();
        this.removeStaleBanner = null;
        if (!cleared) {
          this.host.notify(t("sessionRecovery.staleLockKept"), "info");
          return;
        }
        await this.acquire(path, project.id, stamp?.sha256 ?? null);
        this.startHeartbeat();
      });
      return { proceed: true, readOnly: false };
    }
    await this.prepare(path, project.id, stamp?.sha256 ?? null);
    return { proceed: true, readOnly: false };
  }

  async adopt(path: string | null, readOnly: boolean): Promise<void> {
    this.stopHeartbeat();
    if (this.pending && this.pendingPath) {
      if (this.leasePath && this.leasePath !== this.pendingPath) {
        await this.release();
      }
      this.lease = this.pending;
      this.leasePath = this.pendingPath;
    } else if (readOnly) {
      await this.release();
    } else if (this.leasePath && this.leasePath !== path) {
      await this.release();
    }
    this.pending = null;
    this.pendingPath = null;
    if (!readOnly && this.lease && path) this.startHeartbeat();
  }

  abort(): void {
    if (this.pendingPath && this.pendingPath !== this.leasePath) {
      void clearProjectLease(this.pendingPath, this.instanceId);
    }
    this.pending = null;
    this.pendingPath = null;
  }

  async moveTo(path: string, projectId: string, sha256: string | null): Promise<void> {
    if (path === this.leasePath) return;
    await this.release();
    await this.acquire(path, projectId, sha256);
    this.startHeartbeat();
  }

  /**
   * Enables editing again by explicitly re-reading the lease. A live owner
   * keeps the session view-only; a stale, corrupt or missing lease is replaced.
   */
  async takeOver(
    path: string | null,
    projectId: string,
    projectSha256: string | null,
  ): Promise<boolean> {
    if (!this.host.desktop || !path) return true;
    const read = await readProjectLease(path);
    if (!canTakeOver(classifyLease(read, this.instanceId))) return false;
    this.stopHeartbeat();
    this.lease = null;
    this.leasePath = null;
    await this.acquire(path, projectId, projectSha256);
    if (!this.lease || this.leasePath !== path) return false;
    this.startHeartbeat();
    return true;
  }

  /** A save must not proceed if another instance now owns the lease. */
  async verifyOwnership(): Promise<boolean> {
    if (!this.leasePath) return true;
    const read = await readProjectLease(this.leasePath);
    const state = classifyLease(read, this.instanceId);
    return state !== "liveOther" && state !== "staleOther";
  }

  async release(): Promise<void> {
    const path = this.leasePath;
    if (!path) {
      this.lease = null;
      return;
    }
    const lease = this.lease;
    this.lease = null;
    this.leasePath = null;
    await clearProjectLease(path, lease?.instanceId ?? this.instanceId);
  }

  dispose(): void {
    this.stopHeartbeat();
    this.removeStaleBanner?.();
    this.removeStaleBanner = null;
    void this.release();
  }

  private async prepare(
    path: string,
    projectId: string,
    projectSha256: string | null,
  ): Promise<void> {
    const lease = createLease({
      instanceId: this.instanceId,
      projectId,
      projectSha256,
      hostLabel: hostLabel(this.host.desktop),
      appVersion: appVersion(),
    });
    try {
      await writeProjectLease(path, lease);
      this.pending = lease;
      this.pendingPath = path;
    } catch (error) {
      logEvent("warn", `project lease write failed: ${describeError(error)}`);
      this.host.notify(t("sessionRecovery.lease.writeFailed"), "warning");
      this.pending = null;
      this.pendingPath = null;
    }
  }

  private async acquire(
    path: string,
    projectId: string,
    projectSha256: string | null,
  ): Promise<void> {
    await this.prepare(path, projectId, projectSha256);
    if (this.pending) {
      this.lease = this.pending;
      this.leasePath = this.pendingPath;
      this.pending = null;
      this.pendingPath = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => void this.heartbeat(), LEASE_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private async heartbeat(): Promise<void> {
    const path = this.leasePath;
    if (!path) return;
    try {
      const read = await heartbeatProjectLease(path, this.instanceId, Date.now());
      if (!read.lease) this.stopHeartbeat();
    } catch (error) {
      if (error instanceof LeaseOwnedElsewhereError) {
        this.stopHeartbeat();
        this.lease = null;
        this.leasePath = null;
        this.host.onOwnershipLost();
        return;
      }
      logEvent("warn", `project lease heartbeat failed: ${describeError(error)}`);
    }
  }
}
