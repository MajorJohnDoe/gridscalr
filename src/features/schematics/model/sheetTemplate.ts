import type { MessageKey } from "../../../i18n";
import type { SheetPaperSize } from "../../../model/types";

/**
 * Sheet templates are the static furniture of a schematic sheet: the frame,
 * the title block and, later, a table grid. They are authored in millimetres
 * and converted to PDF points. All rectangles use the same coordinate system
 * as the canvas: the top-left origin of a PDF.js viewport at scale 1.
 */
export type PaperSize = SheetPaperSize;

export const DRAWING_FRAME_TEMPLATE_ID = "gridscalr.operation-card.frame";
export const DATA_SUMMARY_TEMPLATE_ID = "gridscalr.operation-card.data";

export const MM_TO_PT = 72 / 25.4;

export function mm(value: number): number {
  return value * MM_TO_PT;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

export interface SheetTableLabels {
  title: string;
  equipment: string;
  boundary: string;
  electrical: string;
  hvac: string;
  remarks: string;
  object: string;
  makeCode: string;
  supplier: string;
  installer: string;
  connection: string;
  commissioning: string;
  approval: string;
  phase: string;
  power: string;
  current: string;
  flow: string;
  pressure: string;
  dn: string;
  area: string;
  remark: string;
}

/** User-visible labels baked into the static template, not field values. */
export interface SheetLabels {
  handledBy: string;
  card: string;
  date: string;
  system: string;
  assignment: string;
  page: string;
  bet: string;
  rev: string;
  sign: string;
  /** Only required by the data-summary template. */
  table?: SheetTableLabels;
}

type SheetLabelKey = Exclude<keyof SheetLabels, "table">;

export const SHEET_LABEL_KEYS: Record<SheetLabelKey, MessageKey> = {
  handledBy: "sheet.label.handledBy",
  card: "sheet.label.card",
  date: "sheet.label.date",
  system: "sheet.label.system",
  assignment: "sheet.label.assignment",
  page: "sheet.label.page",
  bet: "sheet.label.bet",
  rev: "sheet.label.rev",
  sign: "sheet.label.sign",
};

export const SHEET_TABLE_LABEL_KEYS: Record<keyof SheetTableLabels, MessageKey> = {
  title: "sheet.table.title",
  equipment: "sheet.table.equipment",
  boundary: "sheet.table.boundary",
  electrical: "sheet.table.electrical",
  hvac: "sheet.table.hvac",
  remarks: "sheet.table.remarks",
  object: "sheet.table.object",
  makeCode: "sheet.table.makeCode",
  supplier: "sheet.table.supplier",
  installer: "sheet.table.installer",
  connection: "sheet.table.connection",
  commissioning: "sheet.table.commissioning",
  approval: "sheet.table.approval",
  phase: "sheet.table.phase",
  power: "sheet.table.power",
  current: "sheet.table.current",
  flow: "sheet.table.flow",
  pressure: "sheet.table.pressure",
  dn: "sheet.table.dn",
  area: "sheet.table.area",
  remark: "sheet.table.remark",
};

export function resolveSheetLabels(resolve: (key: MessageKey) => string): SheetLabels {
  return {
    handledBy: resolve(SHEET_LABEL_KEYS.handledBy),
    card: resolve(SHEET_LABEL_KEYS.card),
    date: resolve(SHEET_LABEL_KEYS.date),
    system: resolve(SHEET_LABEL_KEYS.system),
    assignment: resolve(SHEET_LABEL_KEYS.assignment),
    page: resolve(SHEET_LABEL_KEYS.page),
    bet: resolve(SHEET_LABEL_KEYS.bet),
    rev: resolve(SHEET_LABEL_KEYS.rev),
    sign: resolve(SHEET_LABEL_KEYS.sign),
    table: {
      title: resolve(SHEET_TABLE_LABEL_KEYS.title),
      equipment: resolve(SHEET_TABLE_LABEL_KEYS.equipment),
      boundary: resolve(SHEET_TABLE_LABEL_KEYS.boundary),
      electrical: resolve(SHEET_TABLE_LABEL_KEYS.electrical),
      hvac: resolve(SHEET_TABLE_LABEL_KEYS.hvac),
      remarks: resolve(SHEET_TABLE_LABEL_KEYS.remarks),
      object: resolve(SHEET_TABLE_LABEL_KEYS.object),
      makeCode: resolve(SHEET_TABLE_LABEL_KEYS.makeCode),
      supplier: resolve(SHEET_TABLE_LABEL_KEYS.supplier),
      installer: resolve(SHEET_TABLE_LABEL_KEYS.installer),
      connection: resolve(SHEET_TABLE_LABEL_KEYS.connection),
      commissioning: resolve(SHEET_TABLE_LABEL_KEYS.commissioning),
      approval: resolve(SHEET_TABLE_LABEL_KEYS.approval),
      phase: resolve(SHEET_TABLE_LABEL_KEYS.phase),
      power: resolve(SHEET_TABLE_LABEL_KEYS.power),
      current: resolve(SHEET_TABLE_LABEL_KEYS.current),
      flow: resolve(SHEET_TABLE_LABEL_KEYS.flow),
      pressure: resolve(SHEET_TABLE_LABEL_KEYS.pressure),
      dn: resolve(SHEET_TABLE_LABEL_KEYS.dn),
      area: resolve(SHEET_TABLE_LABEL_KEYS.area),
      remark: resolve(SHEET_TABLE_LABEL_KEYS.remark),
    },
  };
}

export const PAPER_SIZES: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  A3: { widthMm: 420, heightMm: 297 },
  A2: { widthMm: 594, heightMm: 420 },
};

/** A tiny vector language for the static frame. It is not a general editor. */
export type FramePrimitive =
  | { kind: "rect"; rect: Rect; strokeWidth?: number; fill?: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; strokeWidth?: number }
  | {
      kind: "text";
      rect: Rect;
      text: string;
      size: number;
      bold?: boolean;
      align?: TextAlign;
      verticalAlign?: VerticalAlign;
      padding?: number;
    };

/** One editable text cell in a template. Values live outside the spec. */
export interface SheetFieldSpec {
  id: string;
  rect: Rect;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  fontSize: number;
  bold?: boolean;
  /** Padding in PDF points. */
  padding: number;
  maxLines: number;
  shrink: boolean;
}

export interface SheetTemplateSpec {
  id: string;
  version: number;
  paper: PaperSize;
  /** Page size in PDF points. */
  width: number;
  height: number;
  drawingArea: Rect;
  staticPrimitives: FramePrimitive[];
  fields: SheetFieldSpec[];
}

export const SHEET_TEMPLATE_VERSION = 1;

export const SHEET_FIELD = {
  projectName: "project.name",
  projectLogo: "project.logo",
  handledBy: "title.handledBy",
  card: "title.card",
  date: "title.date",
  system: "title.system",
  assignment: "title.assignment",
  page: "title.page",
  details: "sheet.details",
} as const;

export type RevisionColumn = "bet" | "rev" | "date" | "sign";

export function revisionFieldId(row: number, column: RevisionColumn): string {
  return `rev.${row}.${column}`;
}

export type TableGroupId = "equipment" | "boundary" | "electrical" | "hvac" | "remarks";

export interface TableColumn {
  key: keyof SheetTableLabels;
  weight: number;
  group: TableGroupId;
}

/** Column order, widths and header groups for the data-summary template. */
export const TABLE_COLUMNS: TableColumn[] = [
  { key: "object", weight: 16, group: "equipment" },
  { key: "makeCode", weight: 8, group: "equipment" },
  { key: "supplier", weight: 5, group: "boundary" },
  { key: "installer", weight: 5, group: "boundary" },
  { key: "connection", weight: 5, group: "boundary" },
  { key: "commissioning", weight: 5, group: "boundary" },
  { key: "approval", weight: 6, group: "boundary" },
  { key: "phase", weight: 6, group: "electrical" },
  { key: "power", weight: 6, group: "electrical" },
  { key: "current", weight: 5, group: "electrical" },
  { key: "flow", weight: 5, group: "hvac" },
  { key: "pressure", weight: 5, group: "hvac" },
  { key: "dn", weight: 4, group: "hvac" },
  { key: "area", weight: 4, group: "hvac" },
  { key: "remark", weight: 15, group: "remarks" },
];

export const TABLE_GROUPS: { id: TableGroupId; labelKey: keyof SheetTableLabels }[] = [
  { id: "equipment", labelKey: "equipment" },
  { id: "boundary", labelKey: "boundary" },
  { id: "electrical", labelKey: "electrical" },
  { id: "hvac", labelKey: "hvac" },
  { id: "remarks", labelKey: "remarks" },
];

export function tableFieldId(row: number, column: number): string {
  return `table.r${row}.c${column}`;
}

const REVISION_COLUMNS: { key: RevisionColumn; width: number }[] = [
  { key: "bet", width: 12 },
  { key: "rev", width: 40 },
  { key: "date", width: 20 },
  { key: "sign", width: 16 },
];

/**
 * Three title-block rows: two label/value pairs each. The first column is the
 * label, the second a value, the third a label and the fourth a value.
 */
const TITLE_ROWS: { left: SheetLabelKey; right: SheetLabelKey }[] = [
  { left: "handledBy", right: "card" },
  { left: "date", right: "system" },
  { left: "assignment", right: "page" },
];

const TITLE_COLUMNS = [22, 30, 22, 30];

const TITLE_VALUE_FIELDS: { row: number; column: 1 | 3; field: string }[] = [
  { row: 0, column: 1, field: SHEET_FIELD.handledBy },
  { row: 0, column: 3, field: SHEET_FIELD.card },
  { row: 1, column: 1, field: SHEET_FIELD.date },
  { row: 1, column: 3, field: SHEET_FIELD.system },
  { row: 2, column: 1, field: SHEET_FIELD.assignment },
  { row: 2, column: 3, field: SHEET_FIELD.page },
];

function cumulative(values: number[]): number[] {
  const result = [0];
  for (const value of values) result.push(result[result.length - 1] + value);
  return result;
}

function field(
  id: string,
  rect: Rect,
  options: Partial<Omit<SheetFieldSpec, "id" | "rect">> = {},
): SheetFieldSpec {
  return {
    id,
    rect,
    align: options.align ?? "left",
    verticalAlign: options.verticalAlign ?? "middle",
    fontSize: options.fontSize ?? 8,
    bold: options.bold,
    padding: options.padding ?? mm(1.5),
    maxLines: options.maxLines ?? 1,
    shrink: options.shrink ?? true,
  };
}

/**
 * The generic drawing frame: revision table bottom-left, project and logo cells
 * in the middle, title block bottom-right. No customer names or logos.
 */
export function buildDrawingFrameTemplate(
  paper: PaperSize,
  labels: SheetLabels,
): SheetTemplateSpec {
  const size = PAPER_SIZES[paper];
  const width = mm(size.widthMm);
  const height = mm(size.heightMm);

  const margin = mm(10);
  const inner = mm(12);
  const bottom = height - inner;
  const bandHeight = mm(38);
  const bandTop = bottom - bandHeight;
  const innerRight = width - inner;

  const revisionWidth = mm(REVISION_COLUMNS.reduce((total, column) => total + column.width, 0));
  const projectX = inner + revisionWidth;
  const titleWidth = mm(TITLE_COLUMNS.reduce((total, column) => total + column, 0));
  const titleX = innerRight - titleWidth;
  const detailsWidth = mm(79);
  const detailsX = titleX - detailsWidth;
  const logoWidth = mm(30);
  const logoX = detailsX - logoWidth;

  const stroke = 0.8;
  const thin = 0.5;
  const labelSize = 6.5;
  const titleLabelSize = 6;
  const primitives: FramePrimitive[] = [];
  const fields: SheetFieldSpec[] = [];

  primitives.push(
    {
      kind: "rect",
      rect: { x: margin, y: margin, width: width - margin * 2, height: height - margin * 2 },
      strokeWidth: 0.6,
    },
    {
      kind: "rect",
      rect: { x: inner, y: inner, width: width - inner * 2, height: height - inner * 2 },
      strokeWidth: stroke,
    },
    { kind: "line", x1: inner, y1: bandTop, x2: innerRight, y2: bandTop, strokeWidth: stroke },
  );

  // Revision table: four data rows above a header row.
  const revisionX = cumulative(REVISION_COLUMNS.map((column) => mm(column.width))).map(
    (x) => inner + x,
  );
  const revisionRowHeight = bandHeight / 5;
  for (let index = 1; index < revisionX.length; index += 1) {
    primitives.push({
      kind: "line",
      x1: revisionX[index],
      y1: bandTop,
      x2: revisionX[index],
      y2: bottom,
      strokeWidth: thin,
    });
  }
  for (let row = 1; row < 5; row += 1) {
    primitives.push({
      kind: "line",
      x1: inner,
      y1: bandTop + revisionRowHeight * row,
      x2: revisionX[revisionX.length - 1],
      y2: bandTop + revisionRowHeight * row,
      strokeWidth: thin,
    });
  }
  const revisionHeaderY = bandTop + revisionRowHeight * 4;
  const revisionLabels: Record<RevisionColumn, string> = {
    bet: labels.bet,
    rev: labels.rev,
    date: labels.date,
    sign: labels.sign,
  };
  REVISION_COLUMNS.forEach((column, index) => {
    primitives.push({
      kind: "text",
      rect: {
        x: revisionX[index],
        y: revisionHeaderY,
        width: mm(column.width),
        height: revisionRowHeight,
      },
      text: revisionLabels[column.key],
      size: labelSize,
      bold: true,
      padding: mm(1.5),
    });
    for (let row = 1; row <= 4; row += 1) {
      fields.push(
        field(
          revisionFieldId(row, column.key),
          {
            x: revisionX[index],
            y: bandTop + revisionRowHeight * (row - 1),
            width: mm(column.width),
            height: revisionRowHeight,
          },
          { fontSize: 7 },
        ),
      );
    }
  });

  // Project name, logo, system/equipment details and title block cells.
  for (const x of [projectX, logoX, detailsX, titleX]) {
    primitives.push({ kind: "line", x1: x, y1: bandTop, x2: x, y2: bottom, strokeWidth: thin });
  }
  fields.push(
    field(
      SHEET_FIELD.projectName,
      { x: projectX, y: bandTop, width: logoX - projectX, height: bandHeight },
      { fontSize: 14, bold: true, align: "center", padding: mm(2), maxLines: 3 },
    ),
    field(
      SHEET_FIELD.projectLogo,
      { x: logoX, y: bandTop, width: detailsX - logoX, height: bandHeight },
      { fontSize: 9, align: "center", padding: mm(2), maxLines: 3 },
    ),
    field(
      SHEET_FIELD.details,
      { x: detailsX, y: bandTop, width: detailsWidth, height: bandHeight },
      { fontSize: 8.5, align: "left", verticalAlign: "middle", padding: mm(2), maxLines: 3 },
    ),
  );

  // Title block: three rows, four columns.
  const titleXPositions = cumulative(TITLE_COLUMNS.map((column) => mm(column))).map(
    (x) => titleX + x,
  );
  const titleRowHeight = bandHeight / 3;
  for (let index = 1; index < titleXPositions.length - 1; index += 1) {
    primitives.push({
      kind: "line",
      x1: titleXPositions[index],
      y1: bandTop,
      x2: titleXPositions[index],
      y2: bottom,
      strokeWidth: thin,
    });
  }
  for (let row = 1; row < 3; row += 1) {
    primitives.push({
      kind: "line",
      x1: titleX,
      y1: bandTop + titleRowHeight * row,
      x2: innerRight,
      y2: bandTop + titleRowHeight * row,
      strokeWidth: thin,
    });
  }
  TITLE_ROWS.forEach((entry, row) => {
    for (const [column, key] of [
      [0, entry.left],
      [2, entry.right],
    ] as const) {
      primitives.push({
        kind: "text",
        rect: {
          x: titleXPositions[column],
          y: bandTop + titleRowHeight * row,
          width: mm(TITLE_COLUMNS[column]),
          height: titleRowHeight,
        },
        text: labels[key],
        size: titleLabelSize,
        bold: true,
        padding: mm(1.2),
      });
    }
  });
  for (const entry of TITLE_VALUE_FIELDS) {
    fields.push(
      field(
        entry.field,
        {
          x: titleXPositions[entry.column],
          y: bandTop + titleRowHeight * entry.row,
          width: mm(TITLE_COLUMNS[entry.column]),
          height: titleRowHeight,
        },
        { maxLines: 2, padding: mm(1.2), fontSize: 7.5 },
      ),
    );
  }

  return {
    id: DRAWING_FRAME_TEMPLATE_ID,
    version: SHEET_TEMPLATE_VERSION,
    paper,
    width,
    height,
    drawingArea: {
      x: inner,
      y: inner,
      width: innerRight - inner,
      height: bandTop - inner,
    },
    staticPrimitives: primitives,
    fields,
  };
}

/**
 * The data-summary sheet keeps the same frame and title block, and fills the
 * drawing area with a fixed-width table. Rows depend on the paper height.
 */
export function buildDataSummaryTemplate(paper: PaperSize, labels: SheetLabels): SheetTemplateSpec {
  const base = buildDrawingFrameTemplate(paper, labels);
  const table = labels.table;
  const inner = mm(12);
  const innerRight = base.width - inner;
  const bandTop = base.height - inner - mm(38);
  const titleHeight = mm(11);
  const groupHeight = mm(8);
  const headerHeight = mm(8);
  const rowHeight = mm(9);
  const totalWidth = innerRight - inner;
  const totalWeight = TABLE_COLUMNS.reduce((sum, column) => sum + column.weight, 0);

  let cursor = inner;
  const columns = TABLE_COLUMNS.map((column) => {
    const width = (totalWidth * column.weight) / totalWeight;
    const x = cursor;
    cursor += width;
    return { ...column, x, width };
  });

  const rows = Math.max(
    1,
    Math.floor((bandTop - inner - titleHeight - groupHeight - headerHeight) / rowHeight),
  );
  const groupTop = inner + titleHeight;
  const headerTop = groupTop + groupHeight;
  const dataTop = headerTop + headerHeight;
  const tableBottom = dataTop + rows * rowHeight;

  const primitives: FramePrimitive[] = [...base.staticPrimitives];
  primitives.push(
    {
      kind: "rect",
      rect: { x: inner, y: inner, width: totalWidth, height: titleHeight },
      fill: "#f2f2f2",
      strokeWidth: 0,
    },
    {
      kind: "rect",
      rect: { x: inner, y: groupTop, width: totalWidth, height: groupHeight },
      fill: "#f7f7f7",
      strokeWidth: 0,
    },
    {
      kind: "rect",
      rect: { x: inner, y: headerTop, width: totalWidth, height: headerHeight },
      fill: "#ededed",
      strokeWidth: 0,
    },
    {
      kind: "rect",
      rect: { x: inner, y: inner, width: totalWidth, height: tableBottom - inner },
      strokeWidth: 0.8,
    },
  );

  for (const column of columns) {
    if (column.x > inner + 0.01) {
      primitives.push({
        kind: "line",
        x1: column.x,
        y1: inner,
        x2: column.x,
        y2: tableBottom,
        strokeWidth: 0.5,
      });
    }
  }
  for (const y of [inner + titleHeight, groupTop + groupHeight, headerTop + headerHeight]) {
    primitives.push({ kind: "line", x1: inner, y1: y, x2: innerRight, y2: y, strokeWidth: 0.5 });
  }
  for (let row = 1; row <= rows; row += 1) {
    const y = dataTop + row * rowHeight;
    primitives.push({ kind: "line", x1: inner, y1: y, x2: innerRight, y2: y, strokeWidth: 0.5 });
  }

  primitives.push({
    kind: "text",
    rect: {
      x: inner + mm(2),
      y: inner,
      width: totalWidth - mm(4),
      height: titleHeight,
    },
    text: table?.title ?? "",
    size: 11,
    bold: true,
    padding: mm(2),
  });

  for (const group of TABLE_GROUPS) {
    const members = columns.filter((column) => column.group === group.id);
    if (!members.length) continue;
    const x = members[0].x;
    const width = members.reduce((sum, column) => sum + column.width, 0);
    primitives.push({
      kind: "text",
      rect: { x, y: groupTop, width, height: groupHeight },
      text: table?.[group.labelKey] ?? "",
      size: 6.5,
      bold: true,
      align: "center",
      padding: mm(1),
    });
  }

  for (const column of columns) {
    primitives.push({
      kind: "text",
      rect: {
        x: column.x,
        y: headerTop,
        width: column.width,
        height: headerHeight,
      },
      text: table?.[column.key] ?? "",
      size: 6,
      bold: true,
      align: "center",
      padding: mm(0.5),
    });
  }

  const fields = [...base.fields];
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns.length; column += 1) {
      const entry = columns[column - 1];
      fields.push(
        field(
          tableFieldId(row, column),
          {
            x: entry.x,
            y: dataTop + (row - 1) * rowHeight,
            width: entry.width,
            height: rowHeight,
          },
          { fontSize: 6.5, padding: mm(1) },
        ),
      );
    }
  }

  return {
    ...base,
    id: DATA_SUMMARY_TEMPLATE_ID,
    staticPrimitives: primitives,
    fields,
  };
}

export interface SheetTemplateDefinition {
  id: string;
  nameKey: MessageKey;
  build(paper: PaperSize, labels: SheetLabels): SheetTemplateSpec;
}

/** Built-in templates in picker order. New templates append; ids never change. */
export const SHEET_TEMPLATES: SheetTemplateDefinition[] = [
  {
    id: DRAWING_FRAME_TEMPLATE_ID,
    nameKey: "sheet.template.frame",
    build: buildDrawingFrameTemplate,
  },
  {
    id: DATA_SUMMARY_TEMPLATE_ID,
    nameKey: "sheet.template.table",
    build: buildDataSummaryTemplate,
  },
];

export const DEFAULT_SHEET_TEMPLATE_ID = SHEET_TEMPLATES[0].id;

export function sheetTemplateFor(
  id: string,
  paper: PaperSize,
  labels: SheetLabels,
): SheetTemplateSpec | null {
  return SHEET_TEMPLATES.find((entry) => entry.id === id)?.build(paper, labels) ?? null;
}
