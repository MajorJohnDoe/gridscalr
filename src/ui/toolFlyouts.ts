import { CLOUD_FILL_PRESETS, type CloudFillPreset } from "../model/cloud";
import { stampStatusColor } from "../model/stamps";
import { DRAW_COLOR_PRESETS } from "../model/style";
import type { AreaMode, AreaShape, HighlightShape } from "../model/types";
import { store, type ToolId } from "../state/store";
import { textDialog } from "./dialogs";
import { el } from "./dom";
import { icon } from "./icons";
import { familyToolForDisplay, rememberFamilyTool, TOOL_BY_ID, type ToolFamily } from "./toolDefs";

const LONG_PRESS_MS = 320;

const VARIANT_TOOLS = new Set(["area", "cloud", "highlight", "callout", "stamp", "arrow"]);

let flyoutRoot: HTMLElement | null = null;
let flyoutCleanup: (() => void) | null = null;
let longPressTimer: number | null = null;

export function hasToolVariants(toolId: string): boolean {
  return VARIANT_TOOLS.has(toolId);
}

export function attachToolFlyout(button: HTMLButtonElement, toolId: string): void {
  if (!VARIANT_TOOLS.has(toolId)) return;
  button.classList.add("has-variants");
  attachPressHandlers(button, () => openToolFlyout(button, toolId));
}

/** Opens the shared rail slot for a tool family on long-press or right-click. */
export function attachToolFamilyFlyout(button: HTMLButtonElement, family: ToolFamily): void {
  button.classList.add("has-variants");
  attachPressHandlers(button, () => openToolFamilyFlyout(button, family));
}

function attachPressHandlers(button: HTMLButtonElement, open: () => void): void {
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (longPressTimer !== null) window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      button.dataset.longPressed = "1";
      open();
    }, LONG_PRESS_MS);
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
    open();
  });
}

export function openToolVariants(anchor: HTMLElement, toolId: string): void {
  if (!VARIANT_TOOLS.has(toolId)) return;
  openToolFlyout(anchor, toolId);
}

/** Opens a shared tool-family menu from the context bar. */
export function openToolFamilyVariants(anchor: HTMLElement, family: ToolFamily): void {
  openToolFamilyFlyout(anchor, family);
}

function openToolFlyout(button: HTMLElement, toolId: string): void {
  store.setTool(toolId as ToolId);
  mountFlyout(button, toolFlyoutLabel(toolId), (panel, rerender) => {
    if (toolId === "area") renderArea(panel, rerender);
    else if (toolId === "cloud") renderCloud(panel, rerender);
    else if (toolId === "highlight") renderHighlight(panel, rerender);
    else if (toolId === "callout") renderCallout(panel, rerender);
    else if (toolId === "stamp") renderStamp(panel, rerender);
    else renderArrow(panel, rerender);
  });
}

function toolFlyoutLabel(toolId: string): string {
  if (toolId === "area") return "Area options";
  if (toolId === "cloud") return "Revision cloud variants";
  if (toolId === "highlight") return "Highlight variants";
  if (toolId === "callout") return "Callout colours";
  if (toolId === "stamp") return "Stamp presets";
  return "Arrow variants";
}

function outsideHandler(event: MouseEvent): void {
  if (!flyoutRoot) return;
  const target = event.target as Node;
  if (flyoutRoot.contains(target)) return;
  closeToolFlyout();
}

function openToolFamilyFlyout(button: HTMLElement, family: ToolFamily): void {
  mountFlyout(button, `${family.label} tools`, (panel) => {
    panel.append(el("div", "tool-flyout-title", family.label));
    panel.append(el("div", "tool-flyout-section", "Tools"));
    const displayed = familyToolForDisplay(family, store.ui.activeTool);
    for (const toolId of family.tools) {
      const tool = TOOL_BY_ID.get(toolId);
      if (!tool) continue;
      variantRow(panel, {
        label: `${tool.label} · ${tool.shortcut}`,
        description: tool.hint,
        iconName: tool.icon,
        selected: displayed === toolId,
        onSelect: () => {
          rememberFamilyTool(toolId);
          store.setTool(toolId);
          closeToolFlyout();
        },
      });
    }
  });
}

function mountFlyout(
  anchor: HTMLElement,
  ariaLabel: string,
  render: (panel: HTMLElement, rerender: () => void) => void,
): void {
  closeToolFlyout();
  const root = el("div", "tool-flyout-root");
  root.addEventListener("mousedown", (event) => {
    if (event.target === root) closeToolFlyout();
  });
  const panel = el("div", "tool-flyout");
  panel.setAttribute("role", "menu");
  panel.setAttribute("aria-label", ariaLabel);
  root.append(panel);
  document.body.append(root);
  flyoutRoot = root;

  const rerender = () => {
    panel.replaceChildren();
    render(panel, rerender);
    positionFlyout(anchor, panel);
  };
  rerender();

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

function positionFlyout(anchor: HTMLElement, panel: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  panel.style.left = `${rect.right + 5}px`;
  panel.style.top = `${rect.top}px`;
  const box = panel.getBoundingClientRect();
  if (box.right > window.innerWidth - 8) {
    panel.style.left = `${Math.max(8, rect.left - box.width - 5)}px`;
  }
  if (box.bottom > window.innerHeight - 8) {
    panel.style.top = `${Math.max(8, window.innerHeight - box.height - 8)}px`;
  }
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

function renderArea(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", "Area"));
  panel.append(el("div", "tool-flyout-section", "Shape"));
  const shapes: Array<{ id: AreaShape; label: string; description: string; iconName: string }> = [
    {
      id: "polygon",
      label: "Polygon",
      description: "Click each corner",
      iconName: "area",
    },
    {
      id: "rectangle",
      label: "Rectangle",
      description: "Drag a quick area",
      iconName: "rect",
    },
    {
      id: "ellipse",
      label: "Ellipse",
      description: "Drag an oval area",
      iconName: "ellipse",
    },
  ];
  for (const entry of shapes) {
    variantRow(panel, {
      label: entry.label,
      description: entry.description,
      iconName: entry.iconName,
      selected: store.ui.measureAreaShape === entry.id,
      onSelect: () => {
        store.setMeasureAreaShape(entry.id);
        render();
      },
    });
  }

  panel.append(el("div", "tool-flyout-section", "Mode"));
  const modes: Array<{ id: AreaMode; label: string; description: string; iconName: string }> = [
    {
      id: "add",
      label: "Add area",
      description: "Adds to the category and room total",
      iconName: "plus",
    },
    {
      id: "subtract",
      label: "Deduct area",
      description: "Subtracts from the same category and room",
      iconName: "minus",
    },
  ];
  for (const entry of modes) {
    variantRow(panel, {
      label: entry.label,
      description: entry.description,
      iconName: entry.iconName,
      selected: store.ui.measureAreaMode === entry.id,
      onSelect: () => {
        store.setMeasureAreaMode(entry.id);
        render();
      },
    });
  }
  panel.append(
    el(
      "div",
      "tool-flyout-note",
      "The mode stays active for the next area. You can also change a placed area in Properties.",
    ),
  );
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
    option.append(
      button,
      el("span", "tool-fill-label", preset.label === "No fill" ? "None" : preset.label),
    );
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
  const entries: Array<{
    id: HighlightShape;
    label: string;
    description: string;
    iconName: string;
  }> = [
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
  panel.append(el("div", "tool-flyout-section", "Colour"));
  renderColorSwatches(panel, render);
}

function renderCallout(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", "Callout"));
  panel.append(el("div", "tool-flyout-section", "Leader colour"));
  renderColorSwatches(panel, render);
  panel.append(
    el(
      "div",
      "tool-flyout-note",
      "The text box stays dark and the text colour is changed in the inline editor.",
    ),
  );
}

function renderArrow(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", "Arrow"));
  panel.append(el("div", "tool-flyout-section", "Heads"));
  variantRow(panel, {
    label: "Single",
    description: "Arrowhead at the end",
    iconName: "arrow",
    selected: store.ui.arrowHeads === "end",
    onSelect: () => {
      store.setArrowHeads("end");
      render();
    },
  });
  variantRow(panel, {
    label: "Double",
    description: "Arrowheads at both ends",
    iconName: "line",
    selected: store.ui.arrowHeads === "both",
    onSelect: () => {
      store.setArrowHeads("both");
      render();
    },
  });
  panel.append(el("div", "tool-flyout-section", "Colour"));
  renderColorSwatches(panel, render);
}

function renderStamp(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", "Stamp"));
  panel.append(el("div", "tool-flyout-section", "Status"));
  const presets = store.project?.settings.stampPresets ?? [];
  if (!presets.length) {
    panel.append(el("div", "tool-flyout-note", "No stamp presets. Add them in Settings."));
  }
  for (const preset of presets) {
    const selected = store.ui.stampText === preset;
    const row = el("button", `tool-variant-row${selected ? " is-selected" : ""}`);
    row.type = "button";
    row.setAttribute("role", "menuitemradio");
    row.setAttribute("aria-checked", String(selected));
    const mark = el("span", "tool-variant-check");
    if (selected) mark.innerHTML = icon("check", 11);
    const dot = el("span", "tool-status-dot");
    dot.style.background = stampStatusColor(preset, store.ui.style.color);
    const text = el("span", "tool-variant-text");
    text.append(el("span", "tool-variant-label", preset));
    row.append(mark, dot, text);
    row.addEventListener("click", () => {
      store.setStampText(preset);
      render();
    });
    panel.append(row);
  }
  const custom = el("button", "tool-variant-row");
  custom.type = "button";
  const customMark = el("span", "tool-variant-check");
  const customIcon = el("span", "tool-variant-icon");
  customIcon.innerHTML = icon("text", 14);
  const customText = el("span", "tool-variant-text");
  customText.append(
    el("span", "tool-variant-label", "Custom…"),
    el("span", "tool-variant-description", "One-off stamp for the next placement"),
  );
  custom.append(customMark, customIcon, customText);
  custom.addEventListener("click", () => {
    closeToolFlyout();
    void textDialog("Custom stamp", "Only for the next stamp", store.ui.stampText, "Status").then(
      (value) => {
        if (value !== null && value.trim()) store.setStampText(value.trim());
      },
    );
  });
  panel.append(custom);
  panel.append(
    el(
      "div",
      "tool-flyout-note",
      "Stamp colours follow the status. Use Properties to override a placed stamp.",
    ),
  );
}

function renderColorSwatches(panel: HTMLElement, render: () => void): void {
  const swatches = el("div", "tool-fill-swatches");
  for (const preset of DRAW_COLOR_PRESETS) {
    const button = el("button", "tool-fill-swatch has-color");
    button.type = "button";
    button.title = preset.label;
    button.setAttribute("aria-label", preset.label);
    button.style.setProperty("--swatch", preset.color);
    button.classList.toggle(
      "is-selected",
      store.ui.style.color.toLowerCase() === preset.color.toLowerCase(),
    );
    button.addEventListener("click", () => {
      store.setStyle({ color: preset.color });
      render();
    });
    const option = el("span", "tool-fill-option");
    option.append(button, el("span", "tool-fill-label", preset.label));
    swatches.append(option);
  }
  panel.append(swatches);
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
