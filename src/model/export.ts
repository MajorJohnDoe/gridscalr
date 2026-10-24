import { totalPageCount } from "./documents";
import type { PageSize, Project } from "./types";

/** Crop rectangle stored relative to the visible page area, 0–1. */
export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One-off drawing export choices. These are deliberately not project data. */
export interface DrawingExportOptions {
  /** 1-based, unique and sorted page numbers. */
  pages: number[];
  /** Missing when the whole page is exported. */
  crop?: NormalizedCrop;
  /** Visible layer ids selected for this export. */
  layerIds: string[];
  includeLabels: boolean;
  includeCalibration: boolean;
  includeLegend: boolean;
}

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageRangeResult {
  pages: number[];
  error: string | null;
}

export function defaultDrawingExportOptions(
  project: Project,
  currentPage: number,
): DrawingExportOptions {
  const page = Math.max(1, Math.min(totalPageCount(project.documents), Math.round(currentPage)));
  return {
    pages: [page],
    layerIds: project.layers.filter((layer) => layer.visible).map((layer) => layer.id),
    includeLabels: true,
    includeCalibration: true,
    includeLegend: false,
  };
}

/** Parses values such as `1-3, 5` into sorted, unique page numbers. */
export function parsePageRange(input: string, pageCount: number): PageRangeResult {
  const text = input.trim();
  if (!text) {
    return { pages: [], error: "Enter at least one page, for example 1-3, 5." };
  }
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    return { pages: [], error: "This document has no pages to export." };
  }

  const pages = new Set<number>();
  for (const rawPart of text.split(",")) {
    const part = rawPart.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) {
      return {
        pages: [],
        error: "Use page numbers and ranges such as 1-3, 5.",
      };
    }
    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end < 1) {
      return { pages: [], error: "Page numbers start at 1." };
    }
    if (start > pageCount || end > pageCount) {
      return {
        pages: [],
        error: `Pages must be between 1 and ${pageCount}.`,
      };
    }
    if (start > end) {
      return { pages: [], error: `The range ${start}-${end} is reversed.` };
    }
    for (let page = start; page <= end; page++) pages.add(page);
  }

  return { pages: [...pages].sort((a, b) => a - b), error: null };
}

/** Compacts sorted pages back into a readable range string. */
export function formatPageList(pages: readonly number[]): string {
  if (!pages.length) return "";
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let index = 1; index <= sorted.length; index++) {
    const page = sorted[index];
    if (page === end + 1) {
      end = page;
      continue;
    }
    parts.push(start === end ? String(start) : `${start}-${end}`);
    start = page;
    end = page;
  }
  return parts.join(", ");
}

/** Converts an axis-aligned page rectangle into a clamped relative crop. */
export function normalizeCropRect(rect: PageRect, pageSize: PageSize): NormalizedCrop | null {
  if (
    !Number.isFinite(pageSize.width) ||
    !Number.isFinite(pageSize.height) ||
    pageSize.width <= 0 ||
    pageSize.height <= 0
  ) {
    return null;
  }
  const left = clamp(Math.min(rect.x, rect.x + rect.width), 0, pageSize.width);
  const right = clamp(Math.max(rect.x, rect.x + rect.width), 0, pageSize.width);
  const top = clamp(Math.min(rect.y, rect.y + rect.height), 0, pageSize.height);
  const bottom = clamp(Math.max(rect.y, rect.y + rect.height), 0, pageSize.height);
  const width = right - left;
  const height = bottom - top;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0.5 || height < 0.5) {
    return null;
  }
  return {
    x: clamp(left / pageSize.width, 0, 1),
    y: clamp(top / pageSize.height, 0, 1),
    width: clamp(width / pageSize.width, 0, 1),
    height: clamp(height / pageSize.height, 0, 1),
  };
}

/** Expands a relative crop to an axis-aligned rectangle on a specific page. */
export function pageRectFromCrop(crop: NormalizedCrop, pageSize: PageSize): PageRect {
  const x = clamp(crop.x, 0, 1) * pageSize.width;
  const y = clamp(crop.y, 0, 1) * pageSize.height;
  const right = clamp(crop.x + crop.width, 0, 1) * pageSize.width;
  const bottom = clamp(crop.y + crop.height, 0, 1) * pageSize.height;
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

/** Share of the page area covered by the crop, for dialog and canvas hints. */
export function cropAreaPercent(crop: NormalizedCrop): number {
  return Math.max(0, Math.min(100, crop.width * crop.height * 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
