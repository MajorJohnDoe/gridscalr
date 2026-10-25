import regularFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import boldFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url";
import type { LabelWeight } from "./label";
import { TEXT_FONT_STACK } from "./text";

export const LABEL_FONT_FAMILY = "GridScalr Label";
export const LABEL_FONT_STACK = `"${LABEL_FONT_FAMILY}", ${TEXT_FONT_STACK}`;

let measureCanvas: CanvasRenderingContext2D | null | undefined;
let fontPromise: Promise<void> | null = null;

/**
 * Load the same Liberation Sans files that the PDF exporter embeds, so canvas
 * text measurement and PDF text measurement produce matching label boxes.
 */
export function ensureLabelFonts(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined" || !document.fonts) {
    return Promise.resolve();
  }
  if (!fontPromise) {
    const regular = new FontFace(LABEL_FONT_FAMILY, `url(${regularFontUrl})`, {
      weight: "400",
    });
    const bold = new FontFace(LABEL_FONT_FAMILY, `url(${boldFontUrl})`, {
      weight: "700",
    });
    fontPromise = Promise.all([regular.load(), bold.load()])
      .then((loaded) => {
        for (const font of loaded) document.fonts.add(font);
      })
      .catch(() => {
        // The UI font stack remains a usable fallback if the assets cannot load.
      });
  }
  return fontPromise;
}

export function measureLabelText(text: string, size: number, weight: LabelWeight): number {
  if (typeof document === "undefined") return fallbackMeasure(text, size);
  if (measureCanvas === undefined) {
    measureCanvas = document.createElement("canvas").getContext("2d");
  }
  if (!measureCanvas) return fallbackMeasure(text, size);
  measureCanvas.font = `${weight === "bold" ? 700 : 400} ${size}px ${LABEL_FONT_STACK}`;
  return measureCanvas.measureText(text).width;
}

function fallbackMeasure(text: string, size: number): number {
  let units = 0;
  for (const character of Array.from(text)) {
    units += character === " " ? 0.28 : character.charCodeAt(0) > 0x2e7f ? 0.95 : 0.56;
  }
  return Math.max(0.1, units * size);
}
