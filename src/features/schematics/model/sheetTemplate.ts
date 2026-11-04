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
}

export const SHEET_LABEL_KEYS: Record<keyof SheetLabels, MessageKey> = {
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
  };
}

export const PAPER_SIZES: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  A3: { widthMm: 420, heightMm: 297 },
  A2: { widthMm: 594, heightMm: 420 },
};

/** A tiny vector language for the static frame. It is not a general editor. */
export type FramePrimitive =
  | { kind: "rect"; rect: Rect; strokeWidth?: number }
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
} as const;

export type RevisionColumn = "bet" | "rev" | "date" | "sign";

export function revisionFieldId(row: number, column: RevisionColumn): string {
  return `rev.${row}.${column}`;
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
const TITLE_ROWS: { left: keyof SheetLabels; right: keyof SheetLabels }[] = [
  { left: "handledBy", right: "card" },
  { left: "date", right: "system" },
  { left: "assignment", right: "page" },
];

const TITLE_COLUMNS = [26, 34, 22, 38];

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
  const logoWidth = mm(50);
  const logoX = titleX - logoWidth;

  const stroke = 0.8;
  const thin = 0.5;
  const labelSize = 6.5;
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

  // Project name and logo/text cells.
  for (const x of [projectX, logoX, titleX]) {
    primitives.push({ kind: "line", x1: x, y1: bandTop, x2: x, y2: bottom, strokeWidth: thin });
  }
  fields.push(
    field(
      SHEET_FIELD.projectName,
      { x: projectX, y: bandTop, width: logoX - projectX, height: bandHeight },
      { fontSize: 12, bold: true, align: "center", padding: mm(2) },
    ),
    field(
      SHEET_FIELD.projectLogo,
      { x: logoX, y: bandTop, width: titleX - logoX, height: bandHeight },
      { fontSize: 9, align: "center", padding: mm(2) },
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
        size: labelSize,
        bold: true,
        padding: mm(1.5),
      });
    }
  });
  for (const entry of TITLE_VALUE_FIELDS) {
    fields.push(
      field(entry.field, {
        x: titleXPositions[entry.column],
        y: bandTop + titleRowHeight * entry.row,
        width: mm(TITLE_COLUMNS[entry.column]),
        height: titleRowHeight,
      }),
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
];

export const DEFAULT_SHEET_TEMPLATE_ID = SHEET_TEMPLATES[0].id;

export function sheetTemplateFor(
  id: string,
  paper: PaperSize,
  labels: SheetLabels,
): SheetTemplateSpec | null {
  return SHEET_TEMPLATES.find((entry) => entry.id === id)?.build(paper, labels) ?? null;
}
