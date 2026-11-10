import { t } from "../../i18n";
import { appVersion } from "./instance";
import {
  clearLegacy,
  clearRecords,
  deleteRecord,
  readAllRecords,
  readLegacySnapshot,
  writeRecord,
} from "./recoveryStore";
import { autosaveRecordId, newCheckpointRecordId, type RecoveryRecord } from "./record";

export interface AutosaveInput {
  projectId: string;
  projectName: string;
  projectPath: string | null;
  instanceId: string;
  baseFileSha256: string | null;
  savedAt: string;
  serialized: string;
  appVersion: string;
}

export interface CheckpointInput extends AutosaveInput {
  label: string;
}

const QUOTA_MESSAGE = t("autosave.quota");

/** A recovery-snapshot failure the user has to act on. */
export class AutosaveError extends Error {
  readonly quotaExceeded: boolean;

  constructor(message: string, quotaExceeded = false) {
    super(message);
    this.name = "AutosaveError";
    this.quotaExceeded = quotaExceeded;
  }
}

function isQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  const code = (error as { code?: unknown }).code;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014 ||
    /quota|storage is full|out of space/i.test(error.message)
  );
}

/** Turns storage failures into a message that names the next action. */
export function describeAutosaveFailure(primary: unknown, fallback?: unknown): AutosaveError {
  if (isQuotaExceeded(primary) || isQuotaExceeded(fallback)) {
    return new AutosaveError(QUOTA_MESSAGE, true);
  }
  const detail =
    primary instanceof Error && primary.message
      ? primary.message
      : fallback instanceof Error && fallback.message
        ? fallback.message
        : "";
  return new AutosaveError(detail ? t("autosave.failedDetail", { detail }) : t("autosave.failed"));
}

let pendingWrite: Promise<unknown> = Promise.resolve();

function queue<T>(operation: () => Promise<T>): Promise<T> {
  const run = pendingWrite.then(operation, operation);
  pendingWrite = run.catch(() => undefined);
  return run;
}

function autosaveRecord(input: AutosaveInput): RecoveryRecord {
  return {
    id: autosaveRecordId(input.projectId, input.instanceId),
    kind: "autosave",
    projectId: input.projectId,
    projectName: input.projectName,
    projectPath: input.projectPath,
    instanceId: input.instanceId,
    baseFileSha256: input.baseFileSha256,
    savedAt: input.savedAt,
    serialized: input.serialized,
    appVersion: input.appVersion,
  };
}

export function writeAutosaveRecord(input: AutosaveInput): Promise<void> {
  return queue(() => writeRecord(autosaveRecord(input)));
}

export function writeCheckpointRecord(input: CheckpointInput): Promise<void> {
  const record: RecoveryRecord = {
    ...autosaveRecord(input),
    id: newCheckpointRecordId("checkpoint"),
    kind: "checkpoint",
    label: input.label,
  };
  return queue(() => writeRecord(record));
}

let migration: Promise<void> | null = null;

async function migrateLegacy(): Promise<void> {
  const snapshot = await readLegacySnapshot();
  if (!snapshot) {
    await clearLegacy();
    return;
  }
  const project = snapshot.project;
  const projectId = String(project.id ?? "legacy-project");
  await writeRecord({
    id: autosaveRecordId(projectId, "legacy"),
    kind: "autosave",
    projectId,
    projectName: project.name || t("app.untitledProject"),
    projectPath: snapshot.projectPath,
    instanceId: "legacy",
    // The legacy snapshot never recorded a base file version. It is offered
    // only as an explicit recovery, always labelled as an unknown base version.
    baseFileSha256: null,
    savedAt: snapshot.savedAt,
    serialized: JSON.stringify(project),
    appVersion: appVersion(),
  });
  await clearLegacy();
}

function ensureLegacyMigration(): Promise<void> {
  if (!migration) {
    migration = migrateLegacy().catch((error) => {
      migration = null;
      throw error;
    });
  }
  return migration;
}

export async function listRecoveryRecords(): Promise<RecoveryRecord[]> {
  try {
    await ensureLegacyMigration();
  } catch {
    // A failed migration must not hide records that already exist.
  }
  return readAllRecords();
}

export function deleteRecoveryRecord(id: string): Promise<void> {
  return queue(() => deleteRecord(id));
}

export function clearAutosavesForInstance(projectId: string, instanceId: string): Promise<void> {
  return queue(() => deleteRecord(autosaveRecordId(projectId, instanceId)));
}

export function clearAllRecovery(): Promise<void> {
  return queue(async () => {
    migration = null;
    await clearRecords();
  });
}
