import { currentLocale, type Locale } from "../../../i18n";
import { decimalSeparator } from "../../../i18n/format";
import { loadAppPreferences, type CsvFormat } from "../../../io/appPreferences";

/**
 * CSV primitives for the schedule round-trip: locale dialect, delimiter and
 * BOM detection, an RFC 4180 parser and the formula-injection guard. The parser
 * is deliberately small and allocation-light so a 20 000-row file stays inside
 * the documented import budget.
 */

export interface ScheduleCsvDialect {
  delimiter: string;
  decimal: string;
  locale: Locale;
  format: CsvFormat;
}

export interface ScheduleCsvDialectOptions {
  locale?: Locale;
  format?: CsvFormat;
}

function appLocale(): Locale {
  return currentLocale();
}

export function scheduleCsvDialect(options: ScheduleCsvDialectOptions = {}): ScheduleCsvDialect {
  const locale = options.locale ?? appLocale();
  const format = options.format ?? loadAppPreferences().csvFormat;
  if (format === "interchange") return { delimiter: ",", decimal: ".", locale, format };
  const decimal = decimalSeparator(locale);
  return { delimiter: decimal === "," ? ";" : ",", decimal, locale, format };
}

const CANDIDATES = [";", ",", "\t"] as const;

/** Picks the delimiter from the header record, ignoring quoted separators. */
export function detectCsvDelimiter(text: string, fallback: string): string {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const counts = new Map<string, number>();
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) break;
    if (!quoted) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  for (const candidate of CANDIDATES) {
    const count = counts.get(candidate) ?? 0;
    if (count > bestCount || (count > 0 && count === bestCount && candidate === fallback)) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parses RFC 4180 text into records. Quoted fields keep embedded separators and
 * newlines; doubled quotes become one quote. Blank lines are skipped, because a
 * trailing newline is normal and is not a data row.
 */
export function parseCsv(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const push = () => {
    if (record.length === 1 && record[0] === "") {
      record = [];
      field = "";
      return;
    }
    records.push(record);
    record = [];
    field = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      record.push(field);
      field = "";
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      push();
      continue;
    }
    field += char;
  }
  if (field !== "" || record.length) {
    record.push(field);
    push();
  }
  return records;
}

/** Quotes a field for RFC 4180; the caller applies the formula guard first. */
export function escapeCsvField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || /[\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const FORMULA_LEAD = /^[=+\-@\t\r]/;
const GUARDED = /^['=+\-@\t\r]/;

/**
 * Prefixes spreadsheet-active text with an apostrophe. A leading apostrophe is
 * escaped too when it would otherwise be read back as a guard, so a literal
 * `'=SUM(A1)` survives a round-trip.
 */
export function guardCsvText(value: string): string {
  if (FORMULA_LEAD.test(value)) return `'${value}`;
  if (value.startsWith("'") && GUARDED.test(value.slice(1))) return `'${value}`;
  return value;
}

/** Removes exactly one export guard; a plain apostrophe is preserved. */
export function unguardCsvText(value: string): string {
  if (value.startsWith("''")) return value.slice(1);
  if (/^'[=+\-@\t\r]/.test(value)) return value.slice(1);
  return value;
}

/** Numbers stay numeric: never guarded, never quoted, locale decimal mark. */
export function formatCsvNumber(value: number, decimal: string): string {
  const text = String(value);
  return decimal === "." ? text : text.replace(".", decimal);
}

export type CsvNumberResult = { value: number } | { problem: "notANumber" };

/**
 * Reads a numeric cell. A decimal comma is accepted only when the delimiter is
 * not a comma, so `1,234` in a comma file stays ambiguous and is rejected
 * instead of silently becoming 1.234.
 */
export function parseCsvNumber(value: string, delimiter: string): CsvNumberResult {
  const text = value.trim();
  if (!text) return { problem: "notANumber" };
  const normalized =
    delimiter !== "," && !text.includes(".") && text.includes(",") ? text.replace(",", ".") : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? { value: number } : { problem: "notANumber" };
}

export type CsvDecodeResult = { text: string } | { problem: "notUtf8" };

/** UTF-8 only. A fatal decoder rejects a BOM-less UTF-16 or Latin-1 file. */
export function decodeCsvBytes(bytes: Uint8Array): CsvDecodeResult {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return { problem: "notUtf8" };
  }
}
