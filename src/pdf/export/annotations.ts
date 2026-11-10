import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, type PDFPage } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import { itemBounds } from "../../model/geometry";
import { countTypeLabel } from "../../features/countTypes/model";
import { itemKindLabel } from "../../model/measure";
import { resolveItemColor } from "../../model/layers";
import type { MarkupItem, Point, Project } from "../../model/types";
import { pdfColor } from "./geometry";

/**
 * Review-only standard PDF annotations.
 *
 * The flattened page is untouched: no appearance stream is attached, no page
 * content is replaced, and no GridScalr data is encoded for round-tripping. The
 * dictionaries exist so another reader can list, filter and comment on the
 * markups. They are not an editable GridScalr project.
 */
const AUTHOR = "GridScalr";
const PRINT_FLAG = 4;

type AnnotationKind = "square" | "circle" | "line" | "polyline" | "polygon" | "text";

interface AnnotationShape {
  kind: AnnotationKind;
  /** PDF-space vertices for line, polyline and polygon annotations. */
  vertices: Point[];
}

function toPdfPoint(viewport: PageViewport, point: Point): Point {
  const [x, y] = viewport.convertToPdfPoint(point.x, point.y);
  return { x, y };
}

function annotationRect(
  viewport: PageViewport,
  item: MarkupItem,
): [number, number, number, number] {
  const bounds = itemBounds(item);
  const corners: Point[] = [
    { x: bounds.min.x, y: bounds.min.y },
    { x: bounds.max.x, y: bounds.min.y },
    { x: bounds.max.x, y: bounds.max.y },
    { x: bounds.min.x, y: bounds.max.y },
  ].map((point) => toPdfPoint(viewport, point));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  let lowX = Math.min(...xs);
  let lowY = Math.min(...ys);
  let highX = Math.max(...xs);
  let highY = Math.max(...ys);
  // A reader rejects a zero-area annotation, so a point markup still gets a
  // small visible rectangle around its anchor.
  if (highX - lowX < 1) {
    lowX -= 0.5;
    highX += 0.5;
  }
  if (highY - lowY < 1) {
    lowY -= 0.5;
    highY += 0.5;
  }
  return [lowX, lowY, highX, highY];
}

function itemVertices(viewport: PageViewport, item: MarkupItem): Point[] {
  return item.points.map((point) => toPdfPoint(viewport, point));
}

function annotationShape(viewport: PageViewport, item: MarkupItem): AnnotationShape {
  switch (item.kind) {
    case "area":
      if (item.areaShape === "rectangle") return { kind: "square", vertices: [] };
      if (item.areaShape === "ellipse") return { kind: "circle", vertices: [] };
      return { kind: "polygon", vertices: itemVertices(viewport, item) };
    case "rect":
    case "image":
    case "count":
    case "symbol":
      return { kind: "square", vertices: [] };
    case "ellipse":
      return { kind: "circle", vertices: [] };
    case "length":
    case "line":
    case "arrow":
      return {
        kind: "line",
        vertices: [item.points[0], item.points[item.points.length - 1]]
          .filter((point): point is Point => Boolean(point))
          .map((point) => toPdfPoint(viewport, point)),
      };
    case "pen":
    case "polyline":
    case "rail":
    case "cloud":
    case "highlight":
    case "radius":
    case "diameter":
    case "arc":
    case "angle":
    case "slope":
      return { kind: "polyline", vertices: itemVertices(viewport, item) };
    case "text":
    case "textbox":
    case "callout":
    case "stamp":
    case "delta":
    case "volume":
      return { kind: "text", vertices: [] };
  }
}

/** Human-readable annotation body; never used to rebuild project data. */
export function annotationContents(project: Project, item: MarkupItem): string {
  const kind = itemKindLabel(item.kind);
  if (item.kind === "count" && item.countType) {
    return `${kind}: ${countTypeLabel(project, item.countType)}`;
  }
  const label = item.label?.trim();
  const text = item.text?.trim();
  const detail = label || text;
  return detail ? `${kind}: ${detail}` : kind;
}

function pushNumbers(dict: PDFDict, key: string, values: number[]): void {
  const context = dict.context;
  const array = PDFArray.withContext(context);
  for (const value of values) array.push(PDFNumber.of(value));
  dict.set(PDFName.of(key), array);
}

function setString(dict: PDFDict, key: string, value: string): void {
  dict.set(PDFName.of(key), PDFHexString.fromText(value));
}

/**
 * Adds one annotation for a visible item. The caller applies the same layer
 * visibility, page scope and hidden-item rules as the flattened drawing.
 */
export function addReviewAnnotation(
  page: PDFPage,
  viewport: PageViewport,
  project: Project,
  item: MarkupItem,
): void {
  const context = page.doc.context;
  const dict = PDFDict.withContext(context);
  const shape = annotationShape(viewport, item);
  const rect = annotationRect(viewport, item);
  const color = pdfColor(resolveItemColor(item));

  dict.set(PDFName.of("Type"), PDFName.of("Annot"));
  dict.set(PDFName.of("Subtype"), PDFName.of(shape.kind));
  pushNumbers(dict, "Rect", rect);
  pushNumbers(dict, "C", [color.red, color.green, color.blue]);
  dict.set(PDFName.of("F"), PDFNumber.of(PRINT_FLAG));
  setString(dict, "Contents", annotationContents(project, item));
  setString(dict, "T", AUTHOR);
  setString(dict, "Subj", itemKindLabel(item.kind));
  setString(dict, "NM", item.id);

  if (shape.kind === "line") {
    const [start, end] = shape.vertices;
    if (!start || !end) return;
    pushNumbers(dict, "L", [start.x, start.y, end.x, end.y]);
  }
  if (shape.kind === "polyline" || shape.kind === "polygon") {
    if (shape.vertices.length < 2) return;
    pushNumbers(
      dict,
      "Vertices",
      shape.vertices.flatMap((point) => [point.x, point.y]),
    );
    if (shape.kind === "polygon") dict.set(PDFName.of("IC"), PDFArray.withContext(context));
  }
  if (shape.kind === "text") {
    // A sticky note keeps the flattened text untouched and needs no /DA font.
    dict.set(PDFName.of("Name"), PDFName.of("Comment"));
  }

  const ref = context.register(dict);
  const annots = page.node.Annots() ?? PDFArray.withContext(context);
  if (!page.node.Annots()) page.node.set(PDFName.of("Annots"), annots);
  annots.push(ref);
}
