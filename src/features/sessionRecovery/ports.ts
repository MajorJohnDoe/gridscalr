import type { ProjectFileMetadata, ProjectFileStamp } from "../saveIntegrity";
import type { RecoveryRecord, RecoverySummary } from "./record";

/** Host callbacks the app supplies. The feature owns the policy, not the DOM shell. */
export interface SessionRecoveryHost {
  desktop: boolean;
  readStamp: (path: string) => Promise<ProjectFileStamp | null>;
  readMetadata: (path: string) => Promise<ProjectFileMetadata | null>;
  pathExists: (path: string) => Promise<boolean>;
  notify: (message: string, kind?: "info" | "success" | "warning" | "error") => void;
  bannerHost: HTMLElement;
  onReload: () => Promise<void>;
  onRestore: (record: RecoveryRecord) => Promise<boolean>;
  onSaveCopy: () => void | Promise<unknown>;
  onSummaryChange: (summary: RecoverySummary) => void;
}

export interface OpenProjectInfo {
  id: string;
  name: string;
}

export interface OpenDecision {
  proceed: boolean;
  readOnly: boolean;
}
