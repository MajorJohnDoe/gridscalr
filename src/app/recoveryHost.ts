import { computeFileMetadata, computeFileStamp } from "../features/saveIntegrity";
import { SessionRecoveryController } from "../features/sessionRecovery";
import { isTauri, pathExists } from "../io/platform";
import { toast } from "../ui/toast";
import type { ProjectSession } from "./projectSession";

/**
 * Wires the recovery feature into the app shell. Keeping this here holds
 * App.ts to the field, one call and dispose; the feature owns the behaviour.
 */
export function createSessionRecovery(
  session: ProjectSession,
  bannerHost: HTMLElement,
  onSummaryChange: () => void,
): SessionRecoveryController {
  const controller = new SessionRecoveryController({
    desktop: isTauri,
    readStamp: (path) => computeFileStamp(path),
    readMetadata: (path) => computeFileMetadata(path),
    pathExists,
    notify: (message, kind) => toast(message, kind),
    bannerHost,
    onReload: () => session.reloadFromDisk(),
    onRestore: (record) => session.restoreRecoveryRecord(record),
    onSaveCopy: () => session.saveProjectCopy(),
    onSummaryChange,
  });
  session.attachRecovery(controller);
  return controller;
}
