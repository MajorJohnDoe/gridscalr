import { invoke } from "@tauri-apps/api/core";
import type { ComposeOutcome } from "./model";

export interface ComposeMailRequest {
  fileName: string;
  pdfBase64: string;
  subject: string;
  body: string;
}

/** Writes the PDF to the app cache and opens a local mail client. */
export function composeMail(request: ComposeMailRequest): Promise<ComposeOutcome> {
  return invoke<ComposeOutcome>("compose_mail", {
    fileName: request.fileName,
    pdfBase64: request.pdfBase64,
    subject: request.subject,
    body: request.body,
  });
}

/** Reveals a previously written attachment in the OS file manager. */
export function revealExport(path: string): Promise<void> {
  return invoke<void>("reveal_export", { path });
}
