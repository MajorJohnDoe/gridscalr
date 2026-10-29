import { strToU8, zipSync } from "fflate";
import { calculateQuantitiesByPage, type QuantityRow, type QuantityType } from "../model/quantity";
import type { Project } from "../model/types";
import type { QuantityReport } from "./reportModel";
import { markupTable, type ReportCell } from "./rows";

interface Sheet {
  name: string;
  rows: ReportCell[][];
  widths?: number[];
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(value: string): ReportCell {
  return { text: value, value };
}

function integerNumber(value: number): ReportCell {
  return { text: String(Math.round(value)), value: Math.round(value) };
}

function decimalNumber(value: number): ReportCell {
  return { text: value.toFixed(3), value };
}

/** Quantity cells keep the three-decimal display used by CSV, except counts. */
function quantityNumber(value: number, type: QuantityType): ReportCell {
  const decimals = type === "count" ? 0 : type === "angle" || type === "slope" ? 1 : 3;
  return {
    text: type === "count" ? String(Math.round(value)) : value.toFixed(decimals),
    value: type === "count" ? Math.round(value) : value,
  };
}

function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function cellXml(cell: ReportCell, row: number, column: number): string {
  const ref = `${columnName(column)}${row}`;
  if (typeof cell.value === "number") {
    const style = cell.text.includes(".") ? 2 : 3;
    return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.text)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows
    .map((cells, index) => {
      const rowNumber = index + 1;
      const style = index === 0 ? 1 : 0;
      const content = cells
        .map((cell, column) =>
          index === 0
            ? `<c r="${columnName(column)}${rowNumber}" t="inlineStr" s="${style}"><is><t>${escapeXml(
                cell.text,
              )}</t></is></c>`
            : cellXml(cell, rowNumber, column),
        )
        .join("");
      return `<row r="${rowNumber}">${content}</row>`;
    })
    .join("");
  const widths = sheet.widths?.length
    ? `<cols>${sheet.widths
        .map(
          (width, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";
  const lastColumn = columnName(Math.max(1, ...sheet.rows.map((row) => row.length)) - 1);
  const lastRow = Math.max(1, sheet.rows.length);
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${widths}<sheetData>${rows}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`;
}

function workbookXml(sheets: Sheet[]): string {
  return `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("")}</sheets></workbook>`;
}

function workbookRels(sheets: Sheet[]): string {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join(
      "",
    )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypes(sheets: Sheet[]): string {
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join(
      "",
    )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

function packageRels(): string {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function stylesXml(): string {
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.000"/><numFmt numFmtId="165" formatCode="0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2933"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

interface Aggregate {
  type: QuantityType;
  unit: string;
  gross: number;
  deduction: number;
  net: number;
  wasteQuantity: number;
  orderQuantity: number;
  items: number;
}

function aggregateRows(
  rows: QuantityRow[],
  key: (row: QuantityRow) => string,
): Map<string, Aggregate> {
  const groups = new Map<string, Aggregate>();
  for (const row of rows) {
    const groupKey = key(row);
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        type: row.type,
        unit: row.unit,
        gross: 0,
        deduction: 0,
        net: 0,
        wasteQuantity: 0,
        orderQuantity: 0,
        items: 0,
      };
      groups.set(groupKey, group);
    }
    group.gross += row.gross;
    group.deduction += row.deduction;
    group.net += row.net;
    group.wasteQuantity += row.wasteQuantity;
    group.orderQuantity += row.orderQuantity;
    group.items += row.items;
  }
  return groups;
}

function aggregateRow(label: string, group: Aggregate): ReportCell[] {
  return [
    text(label),
    text(group.type),
    text(group.unit),
    quantityNumber(group.gross, group.type),
    quantityNumber(group.deduction, group.type),
    quantityNumber(group.net, group.type),
    decimalNumber(group.wasteQuantity),
    quantityNumber(group.orderQuantity, group.type),
    integerNumber(group.items),
  ];
}

function summarySheet(report: QuantityReport): Sheet {
  const rows: ReportCell[][] = [
    [text("Project"), text(report.projectName)],
    [text("Documents"), text(report.documentName)],
    [text("Drawing SHA-256"), text(report.documentSha256)],
    [text("Generated at"), text(report.generatedAt)],
    [text("Scale"), text(report.scaleSummary)],
    [text("Hidden items excluded"), text(report.hiddenExcluded ? "Yes" : "No")],
    [text("Uncalibrated items excluded"), integerNumber(report.summary.uncalibratedExcluded)],
    [],
    [
      text("Quantity type"),
      text("Unit"),
      text("Gross"),
      text("Deduction"),
      text("Net"),
      text("Waste quantity"),
      text("Order quantity"),
      text("Items"),
    ],
    ...report.summary.totals.map((total) => [
      text(total.type),
      text(total.unit),
      quantityNumber(total.gross, total.type),
      quantityNumber(total.deduction, total.type),
      quantityNumber(total.net, total.type),
      decimalNumber(total.wasteQuantity),
      quantityNumber(total.orderQuantity, total.type),
      integerNumber(total.items),
    ]),
  ];
  return { name: "Summary", rows, widths: [24, 18, 14, 14, 14, 16, 16, 10] };
}

function byCategorySheet(report: QuantityReport): Sheet {
  const rows: ReportCell[][] = [
    [
      text("Category"),
      text("Quantity type"),
      text("Unit"),
      text("Gross"),
      text("Deduction"),
      text("Net"),
      text("Waste quantity"),
      text("Order quantity"),
      text("Items"),
    ],
  ];
  for (const category of report.summary.categories) {
    for (const total of category.totals) {
      rows.push(aggregateRow(category.categoryName, total));
    }
  }
  return { name: "By category", rows, widths: [26, 16, 10, 14, 14, 14, 16, 16, 10] };
}

function byRoomSheet(report: QuantityReport): Sheet {
  const groups = aggregateRows(
    report.summary.rows,
    (row) => `${row.room}\u0000${row.type}\u0000${row.unit}`,
  );
  const rows: ReportCell[][] = [
    [
      text("Room"),
      text("Quantity type"),
      text("Unit"),
      text("Gross"),
      text("Deduction"),
      text("Net"),
      text("Waste quantity"),
      text("Order quantity"),
      text("Items"),
    ],
  ];
  for (const [key, group] of groups) {
    const [room] = key.split("\u0000");
    rows.push(aggregateRow(room || "(no room)", group));
  }
  return { name: "By room", rows, widths: [26, 16, 10, 14, 14, 14, 16, 16, 10] };
}

function byPageSheet(project: Project): Sheet {
  const summary = calculateQuantitiesByPage(project);
  const rows: ReportCell[][] = [
    [
      text("Page"),
      text("Page name"),
      text("Building"),
      text("Floor"),
      text("Category"),
      text("Room"),
      text("Quantity type"),
      text("Unit"),
      text("Gross"),
      text("Deduction"),
      text("Net"),
      text("Waste quantity"),
      text("Order quantity"),
      text("Items"),
    ],
  ];
  for (const row of summary.rows) {
    rows.push([
      integerNumber(row.page),
      text(row.pageName),
      text(row.building),
      text(row.floor),
      text(row.categoryName),
      text(row.room),
      text(row.type),
      text(row.unit),
      quantityNumber(row.gross, row.type),
      quantityNumber(row.deduction, row.type),
      quantityNumber(row.net, row.type),
      decimalNumber(row.wasteQuantity),
      quantityNumber(row.orderQuantity, row.type),
      integerNumber(row.items),
    ]);
  }
  return {
    name: "By page",
    rows,
    widths: [8, 24, 18, 16, 24, 20, 16, 10, 14, 14, 14, 16, 16, 10],
  };
}

function markupsSheet(project: Project): Sheet {
  return {
    name: "Markups",
    rows: markupTable(project),
    widths: [8, 16, 22, 30, 16, 10, 30, 34, 24, 22, 18, 24, 24],
  };
}

function sourceNotesSheet(project: Project, report: QuantityReport): Sheet {
  const rows: ReportCell[][] = [
    [text("Field"), text("Value")],
    [text("Project"), text(project.name)],
    [text("Generated at"), text(report.generatedAt)],
    [text("Scale"), text(report.scaleSummary)],
    [text("Hidden items excluded"), text(report.hiddenExcluded ? "Yes" : "No")],
    [text("Uncalibrated items excluded"), integerNumber(report.summary.uncalibratedExcluded)],
    [text("App version"), text(typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "")],
    [text("Project schema"), integerNumber(project.schemaVersion)],
    [],
    [text("Document"), text("Kind"), text("Pages"), text("SHA-256"), text("Path")],
    ...project.documents.map((document) => [
      text(document.name),
      text(document.kind),
      integerNumber(document.pageCount),
      text(document.sha256),
      text(document.path ?? document.relativePath ?? ""),
    ]),
  ];
  return { name: "Source notes", rows, widths: [26, 18, 10, 68, 60] };
}

/**
 * Builds a local XLSX workbook from the same derived report model as the CSV
 * and PDF exports. Nothing in the project is modified.
 */
export function exportQuantityWorkbook(project: Project, report: QuantityReport): Uint8Array {
  const sheets = [
    summarySheet(report),
    byCategorySheet(report),
    byRoomSheet(report),
    byPageSheet(project),
    markupsSheet(project),
    sourceNotesSheet(project, report),
  ];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes(sheets)),
    "_rels/.rels": strToU8(packageRels()),
    "xl/workbook.xml": strToU8(workbookXml(sheets)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels(sheets)),
    "xl/styles.xml": strToU8(stylesXml()),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}
