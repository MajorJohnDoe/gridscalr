import type { OcrPage, OcrWord } from "../../model/types";

export function normalizeOcrWord(raw: unknown): OcrWord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const word = raw as {
    text?: unknown;
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
    confidence?: unknown;
  };
  if (typeof word.text !== "string" || !word.text.trim()) return null;
  const x = Number(word.x);
  const y = Number(word.y);
  const width = Number(word.width);
  const height = Number(word.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const confidence = Number(word.confidence);
  return {
    text: word.text.trim().slice(0, 200),
    x,
    y,
    width,
    height,
    ...(Number.isFinite(confidence) ? { confidence: Math.max(0, Math.min(100, confidence)) } : {}),
  };
}

export function normalizeOcr(raw: unknown): OcrPage | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const value = raw as {
    text?: unknown;
    words?: unknown;
    languages?: unknown;
    generatedAt?: unknown;
    documentSha256?: unknown;
    sourcePage?: unknown;
    width?: unknown;
    height?: unknown;
  };
  const words = (Array.isArray(value.words) ? value.words : [])
    .map(normalizeOcrWord)
    .filter((word): word is OcrWord => Boolean(word))
    .slice(0, 20_000);
  const text =
    typeof value.text === "string"
      ? value.text.slice(0, 2_000_000)
      : words.map((word) => word.text).join(" ");
  if (!text.trim() && !words.length) return undefined;
  const sourcePage = Number(value.sourcePage);
  const width = Number(value.width);
  const height = Number(value.height);
  if (
    !Number.isInteger(sourcePage) ||
    sourcePage < 1 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    typeof value.documentSha256 !== "string" ||
    !value.documentSha256
  ) {
    return undefined;
  }
  return {
    text,
    words,
    engine: "tesseract",
    languages:
      typeof value.languages === "string" && value.languages.trim()
        ? value.languages.trim().slice(0, 40)
        : "eng",
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
    documentSha256: value.documentSha256,
    sourcePage,
    width,
    height,
  };
}
