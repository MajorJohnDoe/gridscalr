import type { ScheduleDefinition } from "../../../model/types";
import { MAX_SCHEDULE_CSV_BYTES } from "../../../io/limits";
import { computeSchedule, findSchedule } from "../model";
import { mapScheduleCsvHeaders } from "./headers";
import { itemMap, processRow, type PlanContext } from "./row";
import type {
  ScheduleCsvBlockCode,
  ScheduleCsvImportOptions,
  ScheduleCsvImportPlan,
} from "./types";
import { MAX_SCHEDULE_CSV_ROWS } from "./types";
import { decodeCsvBytes, detectCsvDelimiter, parseCsv, scheduleCsvDialect } from "./text";

/**
 * Dry-run import planning. Every row is validated against the current schedule
 * before anything is written: unknown and duplicate IDs, wrong types, unknown
 * fields, invalid values, read-only columns and unchanged rows are reported.
 * Only a valid row with at least one different value becomes a change.
 */

function emptyPlan(
  options: ScheduleCsvImportOptions,
  values: {
    scheduleName?: string;
    sizeBytes?: number;
    blocked?: ScheduleCsvBlockCode | null;
    delimiter?: string;
    bom?: boolean;
    totalRows?: number;
  } = {},
): ScheduleCsvImportPlan {
  return {
    scheduleId: options.scheduleId,
    scheduleName: values.scheduleName ?? "",
    fileName: options.fileName ?? "",
    sizeBytes: values.sizeBytes ?? 0,
    blocked: values.blocked ?? null,
    delimiter: values.delimiter ?? scheduleCsvDialect().delimiter,
    bom: values.bom ?? false,
    totalRows: values.totalRows ?? 0,
    changed: [],
    unchanged: [],
    rejected: [],
    issues: [],
    readOnlyColumns: [],
    missingRowCount: 0,
  };
}

function blockedPlan(
  options: ScheduleCsvImportOptions,
  code: ScheduleCsvBlockCode,
  values: {
    scheduleName?: string;
    sizeBytes?: number;
    totalRows?: number;
    delimiter?: string;
    bom?: boolean;
  } = {},
): ScheduleCsvImportPlan {
  return emptyPlan(options, { ...values, blocked: code });
}

function planText(
  text: string,
  options: ScheduleCsvImportOptions,
  sizeBytes: number,
  definition: ScheduleDefinition,
): ScheduleCsvImportPlan {
  let body = text;
  const bom = body.charCodeAt(0) === 0xfeff;
  if (bom) body = body.slice(1);
  const delimiter = detectCsvDelimiter(body, scheduleCsvDialect().delimiter);
  const records = parseCsv(body, delimiter);
  if (!records.length) {
    return blockedPlan(options, "empty", {
      scheduleName: definition.name,
      sizeBytes,
      bom,
      delimiter,
    });
  }
  const headers = records[0];
  const mapping = mapScheduleCsvHeaders(options.project, definition, headers);
  if (mapping.idIndex < 0 || mapping.typeIndex < 0) {
    return blockedPlan(options, "missingHeader", {
      scheduleName: definition.name,
      sizeBytes,
      bom,
      delimiter,
    });
  }
  const data = records.slice(1);
  if (data.length > MAX_SCHEDULE_CSV_ROWS) {
    return blockedPlan(options, "tooManyRows", {
      scheduleName: definition.name,
      sizeBytes,
      bom,
      delimiter,
      totalRows: data.length,
    });
  }

  const result = computeSchedule(options.project, definition);
  const rowsById = new Map(result.rows.map((row) => [row.entityId, row]));
  const idCounts = new Map<string, number>();
  for (const raw of data) {
    const id = (raw[mapping.idIndex] ?? "").trim();
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const context: PlanContext = {
    project: options.project,
    definition,
    rowsById,
    itemById: itemMap(options.project),
    spaceById: new Map(options.project.spaces.map((space) => [space.id, space])),
    idCounts,
    idIndex: mapping.idIndex,
    typeIndex: mapping.typeIndex,
    columns: mapping.columns,
    headers,
    delimiter,
  };
  const rows = data.map((raw, index) => processRow(context, raw, index));
  const fileIds = new Set(data.map((raw) => (raw[mapping.idIndex] ?? "").trim()).filter(Boolean));
  return {
    scheduleId: options.scheduleId,
    scheduleName: definition.name,
    fileName: options.fileName ?? "",
    sizeBytes,
    blocked: null,
    delimiter,
    bom,
    totalRows: data.length,
    changed: rows.filter((row) => row.status === "changed"),
    unchanged: rows.filter((row) => row.status === "unchanged"),
    rejected: rows.filter((row) => row.status === "rejected"),
    issues: mapping.issues,
    readOnlyColumns: mapping.readOnlyColumns,
    missingRowCount: [...rowsById.keys()].filter((id) => !fileIds.has(id)).length,
  };
}

/** Plans an import from decoded text. The byte path below enforces the size limit. */
export function planScheduleCsvImport(
  text: string,
  options: ScheduleCsvImportOptions,
): ScheduleCsvImportPlan {
  const definition = findSchedule(options.project, options.scheduleId);
  if (!definition) return blockedPlan(options, "missingSchedule");
  if (definition.rowMode !== "items") {
    return blockedPlan(options, "groupedSchedule", { scheduleName: definition.name });
  }
  if (text.length > MAX_SCHEDULE_CSV_BYTES) {
    return blockedPlan(options, "tooLarge", { scheduleName: definition.name });
  }
  return planText(text, options, text.length, definition);
}

/**
 * Plans an import from the picked file bytes. The byte limit is checked before
 * decoding and the row limit before any value is mapped, so an oversized file
 * is refused with a clear message instead of being buffered row by row.
 */
export function buildScheduleCsvImport(
  bytes: Uint8Array,
  options: ScheduleCsvImportOptions,
): ScheduleCsvImportPlan {
  const definition = findSchedule(options.project, options.scheduleId);
  if (!definition) return blockedPlan(options, "missingSchedule");
  if (definition.rowMode !== "items") {
    return blockedPlan(options, "groupedSchedule", {
      scheduleName: definition.name,
      sizeBytes: bytes.byteLength,
    });
  }
  if (bytes.byteLength > MAX_SCHEDULE_CSV_BYTES) {
    return blockedPlan(options, "tooLarge", {
      scheduleName: definition.name,
      sizeBytes: bytes.byteLength,
    });
  }
  const decoded = decodeCsvBytes(bytes);
  if ("problem" in decoded) {
    return blockedPlan(options, "notUtf8", {
      scheduleName: definition.name,
      sizeBytes: bytes.byteLength,
    });
  }
  return planText(decoded.text, options, bytes.byteLength, definition);
}
