export interface ProjectLease {
  instanceId: string;
  projectId: string;
  openedAt: number;
  heartbeatAt: number;
  projectSha256: string;
  hostLabel: string;
  appVersion: string;
}

export interface LeaseRead {
  lease: ProjectLease | null;
  corrupt: boolean;
}

export const LEASE_HEARTBEAT_MS = 30_000;
export const LEASE_STALE_MS = 5 * 60_000;

/** `<project>.gridscalr.lock`, beside the project file. */
export function leasePath(projectPath: string): string {
  return `${projectPath}.lock`;
}

/** Five minutes without a heartbeat means the owner is no longer live. */
export function isLeaseStale(lease: ProjectLease, now = Date.now()): boolean {
  return now - lease.heartbeatAt > LEASE_STALE_MS;
}

export type LeaseState = "none" | "own" | "liveOther" | "staleOther" | "corrupt";

export function classifyLease(
  read: LeaseRead,
  ownInstanceId: string,
  now = Date.now(),
): LeaseState {
  if (read.corrupt) return "corrupt";
  const lease = read.lease;
  if (!lease) return "none";
  if (lease.instanceId === ownInstanceId) return "own";
  return isLeaseStale(lease, now) ? "staleOther" : "liveOther";
}

/**
 * Explicit takeover is allowed unless another live instance still owns the
 * project. A stale or corrupt sidecar never blocks the user.
 */
export function canTakeOver(state: LeaseState): boolean {
  return state !== "liveOther";
}

export function createLease(input: {
  instanceId: string;
  projectId: string;
  projectSha256: string | null;
  hostLabel: string;
  appVersion: string;
  now?: number;
}): ProjectLease {
  const now = input.now ?? Date.now();
  return {
    instanceId: input.instanceId,
    projectId: input.projectId,
    openedAt: now,
    heartbeatAt: now,
    projectSha256: input.projectSha256 ?? "",
    hostLabel: input.hostLabel,
    appVersion: input.appVersion,
  };
}
