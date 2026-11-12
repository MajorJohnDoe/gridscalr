import type { Project } from "../../model/types";
import type { RepairChanges } from "./repairPlan";

/** Removes OCR text whose source checksum or source page no longer matches. */
export function planStaleOcr(project: Project, log: RepairChanges): void {
  const documents = new Map(project.documents.map((document) => [document.id, document]));
  for (const page of project.pages) {
    const ocr = page.state?.ocr;
    if (!ocr) continue;
    const document = documents.get(page.documentId);
    if (document && ocr.documentSha256 === document.sha256 && ocr.sourcePage === page.localPage) {
      continue;
    }
    const reason =
      !document || ocr.documentSha256 !== document.sha256
        ? "ocrDocumentMismatch"
        : "ocrSourcePageMismatch";
    delete page.state.ocr;
    log.remove("ocr", page.id, reason);
  }
}
