import type { LeaseRead, ProjectLease } from "./lease";

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function leaseFrom(value: unknown): ProjectLease | null {
  const item = record(value);
  if (!item) return null;
  if (
    typeof item.instanceId !== "string" ||
    typeof item.projectId !== "string" ||
    typeof item.openedAt !== "number" ||
    typeof item.heartbeatAt !== "number" ||
    typeof item.projectSha256 !== "string" ||
    typeof item.hostLabel !== "string" ||
    typeof item.appVersion !== "string"
  ) {
    return null;
  }
  return {
    instanceId: item.instanceId,
    projectId: item.projectId,
    openedAt: item.openedAt,
    heartbeatAt: item.heartbeatAt,
    projectSha256: item.projectSha256,
    hostLabel: item.hostLabel,
    appVersion: item.appVersion,
  };
}

function leaseReadFrom(value: unknown): LeaseRead {
  const item = record(value);
  if (!item) return { lease: null, corrupt: true };
  return {
    lease: leaseFrom(item.lease),
    corrupt: item.corrupt === true,
  };
}

/** A heartbeat found another instance's lease; stop refreshing and stay safe. */
export class LeaseOwnedElsewhereError extends Error {
  constructor() {
    super("leaseOwnedElsewhere");
    this.name = "LeaseOwnedElsewhereError";
  }
}

/**
 * Reads the sidecar lease. A corrupt or unreadable file is reported as
 * information, never as an error that blocks opening the project.
 */
export async function readProjectLease(path: string): Promise<LeaseRead> {
  try {
    return leaseReadFrom(await tauriInvoke<unknown>("read_project_lease", { path }));
  } catch {
    return { lease: null, corrupt: true };
  }
}

export async function writeProjectLease(path: string, lease: ProjectLease): Promise<LeaseRead> {
  return leaseReadFrom(await tauriInvoke<unknown>("write_project_lease", { path, lease }));
}

export async function heartbeatProjectLease(
  path: string,
  instanceId: string,
  heartbeatAt: number,
): Promise<LeaseRead> {
  try {
    return leaseReadFrom(
      await tauriInvoke<unknown>("heartbeat_project_lease", {
        path,
        instanceId,
        heartbeatAt,
      }),
    );
  } catch (error) {
    if (record(error)?.code === "leaseOwnedElsewhere") {
      throw new LeaseOwnedElsewhereError();
    }
    throw error;
  }
}

/** Clears only an owned lease unless `force` is the explicit stale-lock action. */
export async function clearProjectLease(
  path: string,
  instanceId: string,
  force = false,
): Promise<boolean> {
  try {
    return (
      (await tauriInvoke<unknown>("clear_project_lease", {
        path,
        instanceId,
        force,
      })) === true
    );
  } catch {
    return false;
  }
}
