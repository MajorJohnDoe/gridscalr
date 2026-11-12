import type { PDFDocument } from "pdf-lib";
import type { Project } from "../../model/types";

/**
 * Fixed fallback used when a project carries no usable timestamp. A stable
 * epoch keeps two exports of the same project byte-identical.
 */
const FALLBACK_STAMP = new Date(0);

function projectStamp(project: Project): Date {
  for (const value of [project.updatedAt, project.createdAt]) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return FALLBACK_STAMP;
}

/**
 * Writes a deterministic document-info block. pdf-lib stamps a fresh
 * `CreationDate`/`ModDate` on every new document, which makes two exports of the
 * same project differ by a second boundary. Using the project's own timestamp
 * keeps the output reproducible without inventing metadata (F-043).
 */
export function applyExportMetadata(pdf: PDFDocument, project: Project): void {
  const stamp = projectStamp(project);
  pdf.setProducer("GridScalr");
  pdf.setCreator("GridScalr");
  pdf.setCreationDate(stamp);
  pdf.setModificationDate(stamp);
}
