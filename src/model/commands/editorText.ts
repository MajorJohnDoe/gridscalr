import { normalizeColor } from "../color";
import { normalizeDegrees } from "../geometry";
import { makeId } from "../ids";
import { addItem, ensureActiveLayer, findItem, resolveItemColor } from "../layers";
import { reconcileRuns, runsEqual, runsHaveFormatting } from "../richText";
import { stampStatusColor } from "../stamps";
import { clampTextSize } from "../text";
import type { MarkupItem, PageId, Point, Project, TextAlign, TextRun } from "../types";

/**
 * Text editor commands shared by the inline text, text box and annotation
 * editors and by the double-click text dialog.
 *
 * Every function edits the project it is given and reports whether anything
 * changed, so the caller keeps the one `store.mutate(...)` wrapper and one edit
 * stays one undo step. Pure model: no DOM, store, canvas or i18n import; a
 * placeholder for empty annotation text is supplied by the caller.
 */

/** The editable values one text session commits. */
export interface TextEditValues {
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  boxWidth?: number;
  boxHeight?: number;
  runs?: TextRun[];
}

/** The reference a newly created text item can be selected through. */
export interface CreatedTextItem {
  layerId: string;
  itemId: string;
}

/** Input for creating a text note in the active drawing layer. */
export interface NewTextInput {
  pageId: PageId;
  anchor: Point;
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
}

function touch(item: { updatedAt: string }): void {
  item.updatedAt = new Date().toISOString();
}

/** Writes or removes one optional boolean flag instead of storing `false`. */
function applyFlag(
  item: MarkupItem,
  key: "textBold" | "textItalic" | "textUnderline",
  on: boolean,
): void {
  if (on) item[key] = true;
  else delete item[key];
}

/**
 * True when a committed session differs from the snapshot captured when the
 * editor opened. The comparison covers every field any editor mode can change,
 * so an unchanged session never creates an undo step.
 */
export function textEditChanged(values: TextEditValues, original: TextEditValues): boolean {
  return (
    values.text !== original.text ||
    values.color !== original.color ||
    Math.abs(values.fontSize - original.fontSize) > 0.001 ||
    Math.abs(normalizeDegrees(values.rotation) - normalizeDegrees(original.rotation)) > 0.001 ||
    values.bold !== original.bold ||
    values.italic !== original.italic ||
    values.underline !== original.underline ||
    values.align !== original.align ||
    values.boxWidth !== original.boxWidth ||
    values.boxHeight !== original.boxHeight ||
    !runsEqual(values.runs, original.runs)
  );
}

/** Applies a text note edit: text, colour, size, alignment and rotation. */
export function applyTextItemEdit(
  project: Project,
  itemId: string,
  values: TextEditValues,
): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  const rotation = normalizeDegrees(values.rotation);
  item.text = values.text;
  item.color = normalizeColor(values.color, resolveItemColor(item));
  item.fontSize = clampTextSize(values.fontSize);
  applyFlag(item, "textBold", values.bold);
  applyFlag(item, "textItalic", values.italic);
  applyFlag(item, "textUnderline", values.underline);
  if (values.align === "left") delete item.textAlign;
  else item.textAlign = values.align;
  if (rotation === 0) delete item.rotation;
  else item.rotation = rotation;
  touch(item);
  return true;
}

/**
 * Applies a text box edit. Runs are normalized against the plain text and only
 * stored when at least one run differs from the item defaults, so an unstyled
 * box keeps a single plain-text source of truth.
 */
export function applyTextBoxEdit(
  project: Project,
  itemId: string,
  values: TextEditValues,
): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  const runs = reconcileRuns(values.runs ?? [{ text: values.text }], values.text);
  item.text = values.text;
  item.textColor = normalizeColor(values.color, resolveItemColor(item));
  item.fontSize = clampTextSize(values.fontSize);
  applyFlag(item, "textBold", values.bold);
  applyFlag(item, "textItalic", values.italic);
  applyFlag(item, "textUnderline", values.underline);
  if (values.align === "left") delete item.textAlign;
  else item.textAlign = values.align;
  if (runsHaveFormatting(runs, item)) item.runs = runs;
  else delete item.runs;
  touch(item);
  return true;
}

/**
 * Applies a cloud or callout label edit with its fixed box size. Empty text
 * falls back to the caller's localized placeholder rather than a blank label.
 */
export function applyAnnotationEdit(
  project: Project,
  itemId: string,
  values: TextEditValues,
  placeholder: string,
): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  item.text = values.text.trim() || placeholder;
  item.textColor = normalizeColor(values.color, "#f7fbfc");
  item.fontSize = clampTextSize(values.fontSize);
  applyFlag(item, "textBold", values.bold);
  applyFlag(item, "textItalic", values.italic);
  applyFlag(item, "textUnderline", values.underline);
  if (values.align === "center") delete item.textAlign;
  else item.textAlign = values.align;
  if (values.boxWidth) item.textBoxWidth = values.boxWidth;
  else delete item.textBoxWidth;
  if (values.boxHeight) item.textBoxHeight = values.boxHeight;
  else delete item.textBoxHeight;
  touch(item);
  return true;
}

/**
 * Sets a stamp, delta, cloud or callout label from the text dialog and keeps a
 * stamp's status colour in step with its text.
 */
export function applyItemText(
  project: Project,
  itemId: string,
  text: string,
  placeholder: string,
): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  item.text = text.trim() || placeholder;
  if (item.kind === "stamp") item.color = stampStatusColor(item.text, item.color);
  touch(item);
  return true;
}

/**
 * Creates a text note in the active drawing layer for the page. The caller has
 * already rejected empty text and a hidden or locked drawing layer.
 */
export function createTextItem(project: Project, input: NewTextInput): CreatedTextItem {
  const layer = ensureActiveLayer(project, "draw", input.pageId);
  const now = new Date().toISOString();
  const rotation = normalizeDegrees(input.rotation);
  const item: MarkupItem = {
    id: makeId("item"),
    pageId: input.pageId,
    kind: "text",
    points: [{ ...input.anchor }],
    color: normalizeColor(input.color, "#f2a93b"),
    strokeWidth: 2,
    text: input.text,
    fontSize: clampTextSize(input.fontSize),
    textBold: input.bold ? true : undefined,
    textItalic: input.italic ? true : undefined,
    textUnderline: input.underline ? true : undefined,
    textAlign: input.align === "left" ? undefined : input.align,
    rotation: rotation === 0 ? undefined : rotation,
    scale: null,
    createdAt: now,
    updatedAt: now,
  };
  addItem(project, layer.id, item);
  return { layerId: layer.id, itemId: item.id };
}
