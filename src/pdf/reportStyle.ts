import { rgb } from "pdf-lib";
import { documentScheduleTableStyle } from "../features/schedules";
import { pdfColor } from "./export/geometry";

/**
 * Colours of the print-friendly quantity report.
 *
 * The report is a printed sheet, so its paper, ink, rules and header band use
 * the same document palette as a placed takeoff table. The order-quantity
 * accent and the clamped-deduction warning are report-only semantic colours,
 * not band roles: a report row has no group or total band, and the two colours
 * name a status rather than a position in the table (F-140).
 */
const TABLE = documentScheduleTableStyle();

export const REPORT_COLORS = {
  ink: pdfColor(TABLE.ink),
  muted: pdfColor(TABLE.inkMuted),
  sectionRule: pdfColor(TABLE.ruleStrong),
  headerBackground: pdfColor(TABLE.bandHeader),
  headerInk: pdfColor(TABLE.inkStrong),
  orderAccent: rgb(0.02, 0.46, 0.38),
  warning: rgb(0.66, 0.34, 0.04),
} as const;
