import { t } from "../i18n";
import { el } from "./dom";
import { icon } from "./icons";
import { toast } from "./toast";

let cancelPick: (() => void) | null = null;

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (value: number) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Samples the visible PDF and markup layers under the pointer. */
function sampleCanvasColor(host: Element, clientX: number, clientY: number): string | null {
  const interaction = host.querySelector<HTMLCanvasElement>("canvas.canvas-interaction");
  if (!interaction) return null;
  const rect = interaction.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const pointerX = (clientX - rect.left) / rect.width;
  const pointerY = (clientY - rect.top) / rect.height;
  if (pointerX < 0 || pointerX > 1 || pointerY < 0 || pointerY > 1) return null;

  const sample = document.createElement("canvas");
  sample.width = 1;
  sample.height = 1;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1, 1);
  for (const selector of ["canvas.canvas-pdf", "canvas.canvas-content"]) {
    const layer = host.querySelector<HTMLCanvasElement>(selector);
    if (!layer || !layer.width || !layer.height) continue;
    const x = Math.max(0, Math.min(layer.width - 1, Math.floor(pointerX * layer.width)));
    const y = Math.max(0, Math.min(layer.height - 1, Math.floor(pointerY * layer.height)));
    ctx.drawImage(layer, x, y, 1, 1, 0, 0, 1, 1);
  }
  try {
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return rgbToHex(r, g, b);
  } catch {
    return null;
  }
}

/**
 * Enters a one-click colour picking mode over the drawing canvases. The native
 * colour well's eyedropper is provided by the webview and does nothing in some
 * desktop builds, so this gives the app its own working alternative.
 */
function startCanvasPick(input: HTMLInputElement): void {
  cancelPick?.();
  const root = document.documentElement;
  root.classList.add("is-color-picking");
  toast(t("colour.pickHint"), "info");

  const cleanup = () => {
    root.classList.remove("is-color-picking");
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onKeyDown, true);
    cancelPick = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const host = target?.closest(".canvas-host") ?? null;
    if (!host) {
      cleanup();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const color = sampleCanvasColor(host, event.clientX, event.clientY);
    if (!color) {
      cleanup();
      toast(t("colour.pickFailed"), "warning");
      return;
    }
    cleanup();
    input.value = color;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cleanup();
  };

  cancelPick = cleanup;
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("keydown", onKeyDown, true);
}

/** Wraps a colour input with a pipette button that samples the drawing. */
export function colorWithEyedropper(input: HTMLInputElement, label?: string): HTMLElement {
  const wrap = el("span", "color-control");
  const button = el("button", "color-pick");
  button.type = "button";
  button.title = label ?? t("colour.pickFromCanvas");
  button.setAttribute("aria-label", button.title);
  button.innerHTML = icon("eyedropper", 13);
  const syncDisabled = () => {
    button.disabled = input.disabled;
  };
  new MutationObserver(syncDisabled).observe(input, {
    attributes: true,
    attributeFilter: ["disabled"],
  });
  syncDisabled();
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!input.disabled) startCanvasPick(input);
  });
  wrap.append(input, button);
  return wrap;
}
