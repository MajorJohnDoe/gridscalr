import {
  CLOUD_FILL_PRESETS,
  cloudFillColor,
  type CloudFillPreset,
} from "../model/cloud";
import type { HighlightShape } from "../model/types";
import { store } from "../state/store";
import { el } from "./dom";
import { icon } from "./icons";

const LONG_PRESS_MS = 320;

const VARIANT_TOOLS = new Set(["cloud", "highlight"]);

let flyoutRoot: HTMLElement | null = null;
let flyoutCleanup: (() => void) | null = null;
let longPressTimer: number | null = null;

export function hasToolVariants(toolId: string): boolean {
  return VARIANT_TOOLS.has(toolId);
}

export function attachToolFlyout(button: HTMLButtonElement, toolId: string): void {
  if (!VARIANT_TOOLS.has(toolId)) return;
  button.classList.add("has-variants");
  const dot = el("span", "tool-variant-dot");
  button.append(dot);
  if (toolId === "cloud") updateCloudDot(button);

  const open = () => {
    longPressTimer = null;
    button.dataset.longPressed = "1";
    openToolFlyout(button, toolId);
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (longPressTimer !== null) window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(open, LONG_PRESS_MS);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    button.addEventListener(type, () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
  }

  button.addEventListener(
    "click",
    (event) => {
      if (button.dataset.longPressed === "1") {
        delete button.dataset.longPressed;
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openToolFlyout(button, toolId);
  });
}

export function updateToolVariantIndicators(rail: HTMLElement): void {
  const cloud = rail.querySelector<HTMLElement>('[data-tool="cloud"]');
  if (cloud) updateCloudDot(cloud);
}

function updateCloudDot(button: HTMLElement): void {
  const dot = button.querySelector<HTMLElement>(".tool-variant-dot");
  if (!dot) return;
  const color = cloudFillColor(store.ui.cloudFill);
  dot.style.background = color ?? "transparent";
  dot.classList.toggle("is-outline", !color);
}

function openToolFlyout(button: HTMLButtonElement, toolId: string): void {
  closeToolFlyout();
  store.setTool(toolId as "cloud" | "highlight");
  const root = el("div", "tool-flyout-root");
  root.addEventListener("mousedown", (event) => {
    if (event.target === root) closeToolFlyout();
  });
  const panel = el("div", "tool-flyout");
  panel.setAttribute("role", "menu");
  panel.setAttribute("aria-label", toolId === "cloud" ? "Revision cloud variants" : "Highlight variants");
  root.append(panel);
  document.body.append(root);
  flyoutRoot = root;

  const render = () => {
    panel.replaceChildren();
    if (toolId === "cloud") renderCloud(panel, render);
    else renderHighlight(panel, render);
  };
  render();

  const rect = button.getBoundingClientRect();
  panel.style.left = `${rect.right + 5}px`;
  panel.style.top = `${rect.top}px`;
  const box = panel.getBoundingClientRect();
  if (box.right > window.innerWidth - 8) {
    panel.style.left = `${Math.max(8, rect.left - box.width - 5)}px`;
  }
  if (box.bottom > window.innerHeight - 8) {
    panel.style.top = `${Math.max(8, window.innerHeight - box.height - 8)}px`;
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeToolFlyout();
    }
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("mousedown", outsideHandler, true);
  window.addEventListener("resize", closeToolFlyout);
  window.addEventListener("blur", closeToolFlyout);
  flyoutCleanup = () => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("mousedown", outsideHandler, true);
    window.removeEventListener("resize", closeToolFlyout);
    window.removeEventListener("blur", closeToolFlyout);
  };
}

function outsideHandler(event: MouseEvent): void {
  if (!flyoutRoot) return;
  const target = event.target as Node;
  if (flyoutRoot.contains(target)) return;
  closeToolFlyout();
}

function closeToolFlyout(): void {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (!flyoutRoot) return;
  const root = flyoutRoot;
  flyoutRoot = null;
  flyoutCleanup?.();
  flyoutCleanup = null;
  root.remove();
}

function renderCloud(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", "Revision cloud"));

  panel.append(el("div", "tool-flyout-section", "Form"));
  variantRow(panel, {
    label: "Cloud",
    description: "Shape only",
    iconName: "cloud",
    selected: !store.ui.cloudText,
    onSelect: () => {
      store.setCloudText(false);
      render();
    },
  });
  variantRow(panel, {
    label: "Cloud + text",
    description: "Text box and leader",
    iconName: "callout",
    selected: store.ui.cloudText,
    onSelect: () => {
      store.setCloudText(true);
      render();
    },
  });

  panel.append(el("div", "tool-flyout-section", "Fill"));
  const swatches = el("div", "tool-fill-swatches");
  for (const preset of CLOUD_FILL_PRESETS) {
    const button = el("button", "tool-fill-swatch");
    button.type = "button";
    button.title = preset.label;
    button.setAttribute("aria-label", `Cloud fill: ${preset.label}`);
    button.classList.toggle("is-selected", store.ui.cloudFill === preset.id);
    if (preset.color) {
      button.style.setProperty("--swatch", preset.color);
      button.classList.add("has-color");
    } else {
      button.classList.add("is-none");
    }
    button.addEventListener("click", () => {
      store.setCloudFill(preset.id as CloudFillPreset);
      render();
    });
    const option = el("span", "tool-fill-option");
    option.append(button, el("span", "tool-fill-label", preset.label === "No fill" ? "None" : preset.label));
    swatches.append(option);
  }
  panel.append(swatches);
  panel.append(
    el(
      "div",
      "tool-flyout-note",
      "Fill uses a 22% tint. Choose the cloud form and fill independently.",
    ),
  );
}

function renderHighlight(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", "Highlight"));
  const entries: Array<{ id: HighlightShape; label: string; description: string; iconName: string }> = [
    {
      id: "stroke",
      label: "Pen",
      description: "Freehand highlighter",
      iconName: "highlight",
    },
    {
      id: "rectangle",
      label: "Rectangle",
      description: "Translucent box",
      iconName: "rect",
    },
    {
      id: "polygon",
      label: "Polygon",
      description: "Translucent area",
      iconName: "area",
    },
  ];
  for (const entry of entries) {
    variantRow(panel, {
      label: entry.label,
      description: entry.description,
      iconName: entry.iconName,
      selected: store.ui.highlightShape === entry.id,
      onSelect: () => {
        store.setHighlightShape(entry.id);
        render();
      },
    });
  }
}

function variantRow(
  panel: HTMLElement,
  options: {
    label: string;
    description: string;
    iconName: string;
    selected: boolean;
    onSelect: () => void;
  },
): void {
  const button = el("button", `tool-variant-row${options.selected ? " is-selected" : ""}`);
  button.type = "button";
  button.setAttribute("role", "menuitemradio");
  button.setAttribute("aria-checked", String(options.selected));
  const mark = el("span", "tool-variant-check");
  if (options.selected) mark.innerHTML = icon("check", 11);
  const iconWrap = el("span", "tool-variant-icon");
  iconWrap.innerHTML = icon(options.iconName, 15);
  const text = el("span", "tool-variant-text");
  text.append(el("span", "tool-variant-label", options.label));
  text.append(el("span", "tool-variant-description", options.description));
  button.append(mark, iconWrap, text);
  button.addEventListener("click", options.onSelect);
  panel.append(button);
}
