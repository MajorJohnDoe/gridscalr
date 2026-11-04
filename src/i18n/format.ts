import { currentLocale, localeDescriptor, type Locale } from "./index";

/** The BCP-47 locale used for numbers and dates. */
export function numberLocaleFor(locale: Locale = currentLocale()): string {
  return localeDescriptor(locale).numberLocale;
}

export function decimalSeparator(locale: Locale = currentLocale()): string {
  const parts = new Intl.NumberFormat(numberLocaleFor(locale)).formatToParts(1.1);
  return parts.find((part) => part.type === "decimal")?.value ?? ".";
}

/**
 * Formats a number with the active locale. Values are stored as numbers;
 * grouping, decimal marks and digits are presentation only.
 */
export function formatNumber(value: number, maxDecimals = 2, locale?: Locale): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  const target = numberLocaleFor(locale);
  if (abs !== 0 && (abs >= 1e9 || abs < 1e-4)) {
    return value.toExponential(2).replace(".", decimalSeparator(locale));
  }
  return new Intl.NumberFormat(target, {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  }).format(value);
}

export interface DateFormatOptions extends Intl.DateTimeFormatOptions {
  locale?: Locale;
}

/** Formats an ISO timestamp or Date with the active locale. */
export function formatDate(value: string | number | Date, options: DateFormatOptions = {}): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "–";
  const { locale, ...formatOptions } = options;
  const hasOptions = Object.keys(formatOptions).length > 0;
  return new Intl.DateTimeFormat(
    numberLocaleFor(locale),
    hasOptions ? formatOptions : { dateStyle: "medium" },
  ).format(date);
}

/**
 * Parses a localised decimal string. Group separators are removed and the
 * local decimal mark becomes a point before the standard number parser runs.
 */
export function parseLocalizedNumber(text: string, locale?: Locale): number {
  const target = numberLocaleFor(locale);
  const parts = new Intl.NumberFormat(target).formatToParts(12345.6);
  const group = parts.find((part) => part.type === "group")?.value;
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  let cleaned = text.trim().replace(/\u2212/g, "-");
  if (group) cleaned = cleaned.split(group).join("");
  cleaned = cleaned.split(decimal).join(".");
  cleaned = cleaned.replace(/[\s\u00a0\u202f]/g, "");
  if (!cleaned) return Number.NaN;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
}
