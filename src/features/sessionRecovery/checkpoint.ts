import { describeError } from "../../io/platformError";
import { store } from "../../state/store";
import { logEvent } from "../diagnostics/log";
import { writeCheckpointRecord } from "./autosave";
import { appVersion, instanceId } from "./instance";
import { refreshRecoverySummary } from "./summary";

/**
 * Writes one labelled recovery snapshot before a structural action. The
 * checkpoint is never restored automatically; the recovery chooser lists it
 * only as an explicit choice. A failure must not block the action itself.
 */
export async function recordStructuralCheckpoint(label: string): Promise<void> {
  const project = store.project;
  if (!project) return;
  try {
    await writeCheckpointRecord({
      projectId: project.id,
      projectName: project.name,
      projectPath: store.projectPath,
      instanceId: instanceId(),
      baseFileSha256: store.fileStamp?.sha256 ?? null,
      savedAt: new Date().toISOString(),
      serialized: JSON.stringify(project),
      appVersion: appVersion(),
      label,
    });
    void refreshRecoverySummary();
  } catch (error) {
    logEvent("warn", `structural checkpoint failed: ${describeError(error)}`);
  }
}
