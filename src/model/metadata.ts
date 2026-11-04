import type { ProjectMetadata } from "./types";

const METADATA_LIMITS: Record<keyof ProjectMetadata, number> = {
  facility: 120,
  client: 120,
  projectNumber: 60,
  revision: 60,
  preparedBy: 120,
  reportDate: 40,
  notes: 2000,
  reportTitle: 120,
};

export function defaultProjectMetadata(): ProjectMetadata {
  return {
    facility: "",
    client: "",
    projectNumber: "",
    revision: "",
    preparedBy: "",
    reportDate: "",
    notes: "",
    reportTitle: "",
  };
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function normalizeProjectMetadata(value: unknown): ProjectMetadata {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<ProjectMetadata>;
  return {
    facility: cleanText(raw.facility, METADATA_LIMITS.facility),
    client: cleanText(raw.client, METADATA_LIMITS.client),
    projectNumber: cleanText(raw.projectNumber, METADATA_LIMITS.projectNumber),
    revision: cleanText(raw.revision, METADATA_LIMITS.revision),
    preparedBy: cleanText(raw.preparedBy, METADATA_LIMITS.preparedBy),
    reportDate: cleanText(raw.reportDate, METADATA_LIMITS.reportDate),
    notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, METADATA_LIMITS.notes) : "",
    reportTitle: cleanText(raw.reportTitle, METADATA_LIMITS.reportTitle),
  };
}

export function metadataIsEmpty(metadata: ProjectMetadata): boolean {
  return Object.values(metadata).every((value) => !value);
}
