import { normalizeColor } from "./color";
import type { MarkupItem, TextRun } from "./types";
import { TEXT_LINE_HEIGHT } from "./text";

export interface RichTextDefaults {
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface ResolvedTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: number;
  color: string;
}

export interface RichSegment {
  text: string;
  run: ResolvedTextRun;
  width: number;
}

export interface RichLine {
  segments: RichSegment[];
  width: number;
}

export interface RichTextLayout {
  lines: RichLine[];
  lineHeight: number;
  fontSize: number;
}

/** Resolves a run against the box defaults. */
export function resolveTextRun(run: TextRun, defaults: RichTextDefaults): ResolvedTextRun {
  return {
    text: run.text,
    bold: run.bold ?? defaults.bold,
    italic: run.italic ?? defaults.italic,
    underline: run.underline ?? defaults.underline,
    size: run.size ?? defaults.fontSize,
    color: normalizeColor(run.color, defaults.color),
  };
}

export function textRunDefaults(item: MarkupItem): RichTextDefaults {
  return {
    fontSize: item.fontSize ?? 12,
    color: normalizeColor(item.textColor, item.color),
    bold: item.textBold === true,
    italic: item.textItalic === true,
    underline: item.textUnderline === true,
  };
}

export function runsText(runs: readonly TextRun[] | undefined): string {
  return (runs ?? []).map((run) => run.text).join("");
}

export function runsEqual(
  a: readonly TextRun[] | undefined,
  b: readonly TextRun[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((run, index) => {
    const other = b[index];
    return (
      run.text === other.text &&
      run.bold === other.bold &&
      run.italic === other.italic &&
      run.underline === other.underline &&
      run.size === other.size &&
      run.color === other.color
    );
  });
}

/**
 * Returns the runs for an item, or a single plain run when the item has no runs
 * or when the stored runs no longer match the plain-text fallback.
 */
export function runsFromItem(item: MarkupItem): TextRun[] {
  if (item.runs?.length && runsText(item.runs) === (item.text ?? "")) return item.runs;
  return [
    {
      text: item.text ?? "",
      bold: item.textBold,
      italic: item.textItalic,
      underline: item.textUnderline,
      size: item.fontSize,
      color: item.textColor,
    },
  ];
}

/**
 * Keeps formatting only while the text is unchanged. A text edit falls back to
 * one plain run so stale offsets can never split a word in the wrong place.
 */
export function reconcileRuns(runs: readonly TextRun[], text: string): TextRun[] {
  const current = runsText(runs);
  if (current === text) return [...runs];
  return [{ text }];
}

function sameStyle(a: ResolvedTextRun, b: ResolvedTextRun): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.size === b.size &&
    a.color === b.color
  );
}

function appendSegment(
  segments: RichSegment[],
  text: string,
  run: ResolvedTextRun,
  width: number,
): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && sameStyle(last.run, run)) {
    last.text += text;
    last.width += width;
    return;
  }
  segments.push({ text, run: { ...run, text }, width });
}

/**
 * Wraps styled runs to a maximum line width. Chunks keep their leading spaces
 * so a line break removes exactly the space that started the next word.
 */
export function layoutRichText(
  runs: readonly TextRun[],
  maxWidth: number,
  measure: (text: string, run: ResolvedTextRun) => number,
  defaults: RichTextDefaults,
): RichTextLayout {
  const lines: RichLine[] = [];
  let segments: RichSegment[] = [];
  let width = 0;
  let largest = defaults.fontSize;

  const pushLine = () => {
    lines.push({ segments, width });
    segments = [];
    width = 0;
  };

  for (const source of runs) {
    const run = resolveTextRun(source, defaults);
    largest = Math.max(largest, run.size);
    const paragraphs = (run.text ?? "").replace(/\r\n?/g, "\n").split("\n");
    paragraphs.forEach((paragraph, paragraphIndex) => {
      if (paragraphIndex > 0) pushLine();
      const chunks = paragraph.match(/ *[^\s]+/g) ?? [];
      for (const rawChunk of chunks) {
        const chunk = segments.length === 0 ? rawChunk.replace(/^ +/, "") : rawChunk;
        if (!chunk) continue;
        const chunkWidth = measure(chunk, run);
        if (segments.length > 0 && width + chunkWidth > maxWidth) pushLine();
        const text = segments.length === 0 ? chunk.replace(/^ +/, "") : chunk;
        if (!text) continue;
        const measured = measure(text, run);
        appendSegment(segments, text, run, measured);
        width += measured;
      }
    });
  }
  if (segments.length > 0 || lines.length === 0) pushLine();

  return {
    lines,
    lineHeight: Math.max(defaults.fontSize, largest) * TEXT_LINE_HEIGHT,
    fontSize: largest,
  };
}

export interface RunStylePatch {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  color?: string;
}

/**
 * Splits the runs at the selection boundaries and applies a patch to the
 * covered ranges. Runs outside the selection keep their original style.
 */
export function applyRunStyle(
  runs: readonly TextRun[],
  start: number,
  end: number,
  patch: RunStylePatch,
): TextRun[] {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(start, end);
  if (from === to) return [...runs];
  const next: TextRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const runStart = offset;
    const runEnd = offset + run.text.length;
    offset = runEnd;
    if (runEnd <= from || runStart >= to) {
      next.push({ ...run });
      continue;
    }
    const localStart = Math.max(0, from - runStart);
    const localEnd = Math.min(run.text.length, to - runStart);
    if (localStart > 0) next.push({ ...run, text: run.text.slice(0, localStart) });
    const covered = run.text.slice(localStart, localEnd);
    if (covered) {
      next.push({
        ...run,
        ...(patch.bold === undefined ? {} : { bold: patch.bold }),
        ...(patch.italic === undefined ? {} : { italic: patch.italic }),
        ...(patch.underline === undefined ? {} : { underline: patch.underline }),
        ...(patch.size === undefined ? {} : { size: patch.size }),
        ...(patch.color === undefined ? {} : { color: patch.color }),
        text: covered,
      });
    }
    if (localEnd < run.text.length) next.push({ ...run, text: run.text.slice(localEnd) });
  }
  return next.filter((run) => run.text.length > 0);
}

/** True when at least one run differs from the box-level style. */
export function runsHaveFormatting(runs: readonly TextRun[], item: MarkupItem): boolean {
  const defaults = textRunDefaults(item);
  return runs.some((run) => {
    const resolved = resolveTextRun(run, defaults);
    return (
      resolved.bold !== defaults.bold ||
      resolved.italic !== defaults.italic ||
      resolved.underline !== defaults.underline ||
      resolved.size !== defaults.fontSize ||
      resolved.color !== defaults.color
    );
  });
}

/** Layout helper for callers that only need the plain-text content. */
export function itemPlainText(item: MarkupItem): string {
  return item.runs?.length ? runsText(item.runs) : (item.text ?? "");
}
