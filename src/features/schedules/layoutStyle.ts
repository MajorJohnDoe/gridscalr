import { canonicalColor } from "../../model/color";
import type { ScheduleCellRole, ScheduleLineRole } from "./layout";

/**
 * Colour and banding rules for the placed takeoff table.
 *
 * `layout` owns the structure: rows, cells, grid lines and the background bands
 * built here. This module owns the palette roles those bands, rules and text
 * resolve to, so the canvas renderer and the PDF exporter cannot drift apart —
 * both read the same band list from one layout and both resolve the same roles
 * with `resolveScheduleTableStyle`.
 *
 * Nothing here touches a DOM. The token reader is injected: the canvas passes
 * the active theme's CSS custom properties, the PDF passes nothing and gets the
 * document palette. A missing, malformed or unreadable token falls back to the
 * document value, and the resolver guarantees a readable ink/band pair, so an
 * incomplete palette can never draw black text on a black band.
 */

/** A background rectangle behind one row of the placed table. */
export type ScheduleBandRole = "header" | "group" | "row" | "rowAlt" | "subtotal" | "total";

export interface ScheduleBand {
  role: ScheduleBandRole;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every colour a placed table can use. Bands, ink and rules share one record. */
export type ScheduleColorRole =
  | "paper"
  | "bandHeader"
  | "bandRowAlt"
  | "bandGroup"
  | "bandSubtotal"
  | "bandTotal"
  | "ink"
  | "inkStrong"
  | "inkInverse"
  | "inkMuted"
  | "rule"
  | "ruleStrong";

export type ScheduleTableStyle = Record<ScheduleColorRole, string>;

/** Reads one CSS custom property; `null` when the surface has no theme. */
export type StyleTokenReader = (token: string) => string | null | undefined;

/** The theme contract a placed table reads. See `src/styles/tokens.css`. */
export const SCHEDULE_STYLE_TOKENS: Record<ScheduleColorRole, string> = {
  paper: "--table-paper",
  bandHeader: "--table-band-head",
  bandRowAlt: "--table-band-row-alt",
  bandGroup: "--table-band-group",
  bandSubtotal: "--table-band-subtotal",
  bandTotal: "--table-band-total",
  ink: "--table-ink",
  inkStrong: "--table-ink-strong",
  inkInverse: "--table-ink-inverse",
  inkMuted: "--table-ink-muted",
  rule: "--table-rule",
  ruleStrong: "--table-rule-strong",
};

/**
 * The printed-document palette: the PDF export, the fallback for every role and
 * the readability reference for a theme that ships an incomplete contract.
 */
export const DOCUMENT_SCHEDULE_STYLE: ScheduleTableStyle = {
  paper: "#ffffff",
  bandHeader: "#e8edf2",
  bandRowAlt: "#eef2f6",
  bandGroup: "#dde5ec",
  bandSubtotal: "#e9eef3",
  bandTotal: "#232b33",
  ink: "#1b232b",
  inkStrong: "#0c1218",
  inkInverse: "#f8fafc",
  inkMuted: "#5b6672",
  rule: "#d2dae2",
  ruleStrong: "#9aa7b3",
};

/** WCAG AA for normal text; the placed table never ships below it. */
export const MIN_TABLE_CONTRAST = 4.5;

let documentStyle: ScheduleTableStyle | null = null;

/** Every text role and the bands it is actually drawn on. */
const INK_SURFACES: ReadonlyArray<readonly [ScheduleColorRole, readonly ScheduleColorRole[]]> = [
  ["ink", ["paper", "bandRowAlt", "bandSubtotal", "bandGroup"]],
  ["inkStrong", ["bandHeader", "bandGroup", "bandSubtotal"]],
  ["inkInverse", ["bandTotal"]],
  ["inkMuted", ["paper"]],
];

function luminance(color: string): number | null {
  const canonical = canonicalColor(color);
  if (!canonical) return null;
  const value = Number.parseInt(canonical.slice(1), 16);
  const channel = (part: number) =>
    part <= 0.03928 ? part / 12.92 : Math.pow((part + 0.055) / 1.055, 2.4);
  return (
    0.2126 * channel(((value >> 16) & 255) / 255) +
    0.7152 * channel(((value >> 8) & 255) / 255) +
    0.0722 * channel((value & 255) / 255)
  );
}

/** WCAG contrast ratio; 0 when either colour cannot be parsed. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  if (a === null || b === null) return 0;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function lowestContrast(
  ink: string,
  surfaces: readonly ScheduleColorRole[],
  style: ScheduleTableStyle,
) {
  return surfaces.reduce(
    (lowest, surface) => Math.min(lowest, contrastRatio(ink, style[surface])),
    Number.POSITIVE_INFINITY,
  );
}

/** The most readable document ink for a set of bands, used when a theme fails. */
function fallbackInk(surfaces: readonly ScheduleColorRole[], style: ScheduleTableStyle): string {
  let best = DOCUMENT_SCHEDULE_STYLE.ink;
  let bestScore = -1;
  for (const candidate of [DOCUMENT_SCHEDULE_STYLE.ink, DOCUMENT_SCHEDULE_STYLE.inkInverse]) {
    const score = lowestContrast(candidate, surfaces, style);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function resolveRole(reader: StyleTokenReader, role: ScheduleColorRole): string {
  const read = canonicalColor(reader(SCHEDULE_STYLE_TOKENS[role]));
  if (read) return read;
  const document = canonicalColor(DOCUMENT_SCHEDULE_STYLE[role]);
  return document ?? "#ffffff";
}

/**
 * Resolves the placed-table palette from a theme. A role whose token is absent
 * or malformed keeps the document value; an ink that cannot reach
 * `MIN_TABLE_CONTRAST` on every band it is drawn on is replaced, and a band that
 * defeats both document inks is restored, so the result is always readable.
 */
export function resolveScheduleTableStyle(reader: StyleTokenReader): ScheduleTableStyle {
  const style = {} as ScheduleTableStyle;
  for (const role of Object.keys(SCHEDULE_STYLE_TOKENS) as ScheduleColorRole[]) {
    style[role] = resolveRole(reader, role);
  }
  for (const [ink, surfaces] of INK_SURFACES) {
    if (lowestContrast(style[ink], surfaces, style) >= MIN_TABLE_CONTRAST) continue;
    const fallback = fallbackInk(surfaces, style);
    if (lowestContrast(fallback, surfaces, style) >= MIN_TABLE_CONTRAST) {
      style[ink] = fallback;
      continue;
    }
    for (const surface of surfaces) style[surface] = DOCUMENT_SCHEDULE_STYLE[surface];
    style[ink] = fallbackInk(surfaces, style);
  }
  return style;
}

/** The document palette the PDF export draws with. Resolved once; treat it as read-only. */
export function documentScheduleTableStyle(): ScheduleTableStyle {
  documentStyle ??= resolveScheduleTableStyle(() => null);
  return documentStyle;
}

/**
 * Band role for one body row. Striping follows the data row index, so a group
 * header or a subtotal never shifts the stripe, and a grouped-mode row that
 * stands in for its whole group carries the group band.
 */
export function bandRoleFor(
  kind: ScheduleCellRole,
  firstRow: number,
  grouped: boolean,
): ScheduleBandRole {
  switch (kind) {
    case "header":
      return "header";
    case "group":
      return "group";
    case "subtotal":
      return grouped ? "group" : "subtotal";
    case "total":
      return "total";
    case "empty":
    case "row":
      return firstRow % 2 === 0 ? "row" : "rowAlt";
  }
}

/** Band role to background colour role; an even row is the table paper. */
export function bandColorRole(role: ScheduleBandRole): ScheduleColorRole {
  switch (role) {
    case "header":
      return "bandHeader";
    case "group":
      return "bandGroup";
    case "subtotal":
      return "bandSubtotal";
    case "total":
      return "bandTotal";
    case "row":
      return "paper";
    case "rowAlt":
      return "bandRowAlt";
  }
}

/** Cell role to ink colour role: headings, rows, muted states and the total. */
export function inkColorRole(role: ScheduleCellRole): ScheduleColorRole {
  switch (role) {
    case "header":
    case "group":
    case "subtotal":
      return "inkStrong";
    case "total":
      return "inkInverse";
    case "empty":
      return "inkMuted";
    case "row":
      return "ink";
  }
}

/**
 * Line role to rule colour role. `null` means the caller draws the line in the
 * item colour, which keeps a placed table identifiable by its layer colour.
 */
export function ruleColorRole(role: ScheduleLineRole): ScheduleColorRole | null {
  switch (role) {
    case "grid":
      return "rule";
    case "header":
    case "group":
    case "subtotal":
    case "total":
      return "ruleStrong";
    case "outer":
      return null;
  }
}
