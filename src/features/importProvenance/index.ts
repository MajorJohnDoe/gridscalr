/**
 * Read-only presentation of import provenance. Other modules import only this
 * surface; see ADR 0013.
 */
export {
  pageProvenanceSummary,
  provenanceByPage,
  shortIdentifier,
  shortRevision,
  summarizePageProvenance,
} from "./model";
export type { ProvenanceSummary } from "./model";
export {
  formatProvenanceDate,
  markupsProvenanceCell,
  pageProvenanceSection,
  PROVENANCE_COLUMN,
  PROVENANCE_COLUMN_WIDTH,
  withProvenanceColumn,
} from "./ui";
export type { MarkupsDisplayColumn } from "./ui";
