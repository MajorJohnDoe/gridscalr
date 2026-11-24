import { drawingPdfFileName } from "../../model/export";
import { t } from "../../i18n";

/** Above this size the drawing is offered as a disk export first. */
export const ATTACHMENT_WARN_BYTES = 20 * 1024 * 1024;

export type ComposeStatus = "draft" | "no_client" | "failed";

/** The Rust `compose_mail` outcome. The written path is always present. */
export interface ComposeOutcome {
  status: ComposeStatus;
  path: string;
  detail: string;
}

export type AttachmentChoice = "continue" | "export";

export interface OutcomeMessage {
  kind: "success" | "warning" | "error";
  message: string;
}

/** The attachment is the same drawing PDF the export dialog writes. */
export function safeAttachmentName(projectName: string): string {
  return drawingPdfFileName(projectName);
}

export function mailSubject(projectName: string): string {
  return t("shareByEmail.subject", { project: projectName });
}

export function mailBody(projectName: string): string {
  return t("shareByEmail.body", { project: projectName });
}

/** A warning, not a refusal: the user can continue with the same PDF. */
export function exceedsAttachmentWarning(bytes: number): boolean {
  return bytes > ATTACHMENT_WARN_BYTES;
}

export function attachmentSizeMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function isComposeStatus(value: unknown): value is ComposeStatus {
  return value === "draft" || value === "no_client" || value === "failed";
}

/** Refuses a malformed command reply rather than showing a silent success. */
export function normalizeComposeOutcome(value: unknown): ComposeOutcome | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ComposeOutcome>;
  if (!isComposeStatus(candidate.status)) return null;
  if (typeof candidate.path !== "string" || !candidate.path.trim()) return null;
  return {
    status: candidate.status,
    path: candidate.path,
    detail: typeof candidate.detail === "string" ? candidate.detail : "",
  };
}

/** Maps the Rust outcome to the localized message for the toast or dialog. */
export function outcomeMessage(outcome: ComposeOutcome): OutcomeMessage {
  if (outcome.status === "draft") {
    return { kind: "success", message: t("shareByEmail.draftToast") };
  }
  if (outcome.status === "no_client") {
    return {
      kind: "warning",
      message: t("shareByEmail.noClientMessage", { path: outcome.path }),
    };
  }
  return {
    kind: "error",
    message: t("shareByEmail.failedMessage", { path: outcome.path }),
  };
}
