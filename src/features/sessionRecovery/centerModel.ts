import type { MessageKey } from "../../i18n";
import type { RecoverableEntry } from "./recovery";
import type { RecoveryRecord } from "./record";

/** One app instance that wrote records for the same project. */
export interface RecoveryInstanceGroup {
  instanceId: string;
  appVersion: string;
  latestSavedAt: string;
  entries: RecoverableEntry[];
}

/** Every recovery record for one project, grouped by the instance that wrote it. */
export interface RecoveryProjectGroup {
  projectId: string;
  projectName: string;
  projectPath: string | null;
  latestSavedAt: string;
  count: number;
  instances: RecoveryInstanceGroup[];
}

export type RecoveryCenterAction = "restore" | "delete" | "cancel";

export interface RecoveryCenterChoice {
  action: RecoveryCenterAction;
  record: RecoveryRecord | null;
}

const BASE_VERSION_KEYS: Record<RecoverableEntry["state"], MessageKey> = {
  current: "sessionRecovery.state.current",
  older: "sessionRecovery.state.older",
  unknown: "sessionRecovery.state.unknown",
  missing: "sessionRecovery.state.missing",
  unsaved: "sessionRecovery.state.unsaved",
};

/** Catalog key for a record's base-version label. Keeps model and UI separated. */
export function baseVersionLabelKey(state: RecoverableEntry["state"]): MessageKey {
  return BASE_VERSION_KEYS[state];
}

function sortedEntries(entries: readonly RecoverableEntry[]): RecoverableEntry[] {
  const order = new Map(entries.map((entry, index) => [entry.record.id, index]));
  return [...entries].sort((left, right) => {
    const byTime = right.record.savedAt.localeCompare(left.record.savedAt);
    if (byTime !== 0) return byTime;
    const byKind =
      left.record.kind === right.record.kind ? 0 : left.record.kind === "autosave" ? -1 : 1;
    if (byKind !== 0) return byKind;
    return (order.get(left.record.id) ?? 0) - (order.get(right.record.id) ?? 0);
  });
}

/**
 * Groups every record per project and, within it, per app instance. The newest
 * record supplies the project's display name and the instance's app version, so
 * a renamed project shows its latest name without splitting the group.
 */
export function groupRecoveryEntries(entries: readonly RecoverableEntry[]): RecoveryProjectGroup[] {
  const projects = new Map<string, RecoveryProjectGroup>();
  const instances = new Map<string, Map<string, RecoveryInstanceGroup>>();
  const order: string[] = [];

  for (const entry of sortedEntries(entries)) {
    const record = entry.record;
    let project = projects.get(record.projectId);
    let projectInstances = instances.get(record.projectId);
    if (!project || !projectInstances) {
      project = {
        projectId: record.projectId,
        projectName: record.projectName,
        projectPath: record.projectPath,
        latestSavedAt: record.savedAt,
        count: 0,
        instances: [],
      };
      projectInstances = new Map();
      projects.set(record.projectId, project);
      instances.set(record.projectId, projectInstances);
      order.push(record.projectId);
    }
    if (!project.projectPath && record.projectPath) project.projectPath = record.projectPath;
    project.count += 1;

    let instance = projectInstances.get(record.instanceId);
    if (!instance) {
      instance = {
        instanceId: record.instanceId,
        appVersion: record.appVersion,
        latestSavedAt: record.savedAt,
        entries: [],
      };
      projectInstances.set(record.instanceId, instance);
      project.instances.push(instance);
    }
    instance.entries.push(entry);
  }

  return order.map((projectId) => projects.get(projectId) as RecoveryProjectGroup);
}

/** The preferred record when it still exists, otherwise the first visible record. */
export function defaultCenterSelection(
  groups: readonly RecoveryProjectGroup[],
  preferredId: string | null = null,
): string | null {
  if (preferredId) {
    const found = findCenterEntry(groups, preferredId);
    if (found) return preferredId;
  }
  return groups[0]?.instances[0]?.entries[0]?.record.id ?? null;
}

export function findCenterEntry(
  groups: readonly RecoveryProjectGroup[],
  id: string | null,
): RecoverableEntry | null {
  if (!id) return null;
  for (const group of groups) {
    for (const instance of group.instances) {
      const entry = instance.entries.find((candidate) => candidate.record.id === id);
      if (entry) return entry;
    }
  }
  return null;
}

/**
 * A record whose base file changed, disappeared or cannot be verified needs an
 * explicit warning before restore. A current record is still only restored by
 * choosing it; this flag adds the old-version confirmation, it never enables an
 * automatic restore.
 */
export function needsRestoreConfirmation(state: RecoverableEntry["state"]): boolean {
  return state === "older" || state === "unknown" || state === "missing";
}

export function centerIsEmpty(groups: readonly RecoveryProjectGroup[]): boolean {
  return groups.every((group) => group.count === 0);
}
