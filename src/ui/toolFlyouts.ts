import { CLOUD_FILL_PRESETS, cloudFillLabel, type CloudFillPreset } from "../model/cloud";
import { stampStatusColor } from "../model/stamps";
import { DRAW_COLOR_PRESETS, STROKE_WIDTH_OPTIONS, drawColorLabel } from "../model/style";
import type { AreaMode, AreaShape, HighlightShape } from "../model/types";
import { store, type ToolId } from "../state/store";
import { colorInputValue, colorWithEyedropper, setColorInput } from "./colorPicker";
import { textDialog } from "./dialogs";
import { el, option } from "./dom";
import { icon } from "./icons";
import { familyToolForDisplay, rememberFamilyTool, TOOL_BY_ID, type ToolFamily } from "./toolDefs";
import { t } from "../i18n";

const LONG_PRESS_MS = 320;

const VARIANT_TOOLS = new Set([
  "area",
  "cloud",
  "highlight",
  "callout",
  "stamp",
  "arrow",
  "line",
  "polyline",
]);

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
    else if (toolId === "line" || toolId === "polyline") renderLineOptions(panel, rerender, toolId);
    else renderArrow(panel, rerender);
  });
}

function toolFlyoutLabel(toolId: string): string {
  if (toolId === "area") return t("tool.flyout.areaOptions");
  if (toolId === "cloud") return t("tool.flyout.cloudVariants");
  if (toolId === "highlight") return t("tool.flyout.highlightVariants");
  if (toolId === "callout") return t("tool.flyout.calloutColours");
  if (toolId === "stamp") return t("tool.flyout.stampPresets");
  if (toolId === "line") return t("tool.flyout.lineOptions");
  if (toolId === "polyline") return t("tool.flyout.pipeOptions");
  return t("tool.flyout.arrowVariants");
}

function renderLineOptions(panel: HTMLElement, render: () => void, toolId: string): void {
  const isPipe = toolId === "polyline";
  panel.append(el("div", "tool-flyout-title", t(isPipe ? "toolFlyout.pipe" : "toolFlyout.line")));

  if (isPipe && store.project) {
    panel.append(el("div", "tool-flyout-section", t("toolFlyout.lineType")));
    const lineTypeSelect = el("select", "select tool-flyout-select");
    lineTypeSelect.setAttribute("aria-label", t("toolFlyout.lineType"));
    for (const lineType of store.project.lineTypes) {
      lineTypeSelect.append(
        option(
          lineType.id,
          `${lineType.name} · ${lineType.widthPt} pt`,
          lineType.id === store.ui.lineTypeId,
        ),
      );
    }
    lineTypeSelect.addEventListener("change", () => {
      store.setLineType(lineTypeSelect.value);
      render();
    });
    panel.append(lineTypeSelect);
    const edit = el("button", "btn btn-small btn-ghost", t("toolFlyout.editLineTypes"));
    edit.type = "button";
    edit.addEventListener("click", () => {
      closeToolFlyout();
      void import("../features/schematics/ui/lineTypeDialog").then((module) =>
        module.openLineTypeDialog(),
      );
    });
    panel.append(edit);
  }

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.colour")));
  renderLineColourSwatches(panel, render);

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.strokeWidth")));
  const widths = el("div", "tool-width-options");
  for (const value of STROKE_WIDTH_OPTIONS) {
    const button = el("button", "tool-width-option", `${value} pt`);
    button.type = "button";
    button.classList.toggle("is-selected", Math.abs(store.ui.lineStyle.widthPt - value) < 0.01);
    button.addEventListener("click", () => {
      store.setLineStyle({ widthPt: value });
      render();
    });
    widths.append(button);
  }
  panel.append(widths);

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.lineStyle")));
  for (const [dashed, label] of [
    [false, t("toolFlyout.solid")],
    [true, t("toolFlyout.dashed")],
  ] as const) {
    variantRow(panel, {
      label,
      description: dashed ? t("toolFlyout.dashedHint") : t("toolFlyout.solidHint"),
      iconName: "line",
      selected: store.ui.lineStyle.dashed === dashed,
      onSelect: () => {
        store.setLineStyle({ dashed });
        render();
      },
    });
  }
}

function renderLineColourSwatches(panel: HTMLElement, render: () => void): void {
  const swatches = el("div", "tool-fill-swatches");
  for (const preset of DRAW_COLOR_PRESETS) {
    const button = el("button", "tool-fill-swatch has-color");
    button.type = "button";
    button.title = drawColorLabel(preset);
    button.setAttribute("aria-label", drawColorLabel(preset));
    button.style.setProperty("--swatch", preset.color);
    button.classList.toggle(
      "is-selected",
      store.ui.lineStyle.color.toLowerCase() === preset.color.toLowerCase(),
    );
    button.addEventListener("click", () => {
      store.setLineStyle({ color: preset.color });
      render();
    });
    const option = el("span", "tool-fill-option");
    option.append(button, el("span", "tool-fill-label", drawColorLabel(preset)));
    swatches.append(option);
  }
  panel.append(swatches);
}

function outsideHandler(event: MouseEvent): void {
  if (!flyoutRoot) return;
  const target = event.target as Node;
  if (flyoutRoot.contains(target)) return;
  closeToolFlyout();
}

function openToolFamilyFlyout(button: HTMLElement, family: ToolFamily): void {
  if (family.id === "rect-ellipse") {
    mountFlyout(button, t("tool.family.shapes"), (panel, rerender) =>
      renderShapeOptions(panel, rerender),
    );
    return;
  }
  mountFlyout(button, t("tool.familyTools", { name: t(family.label) }), (panel) => {
    panel.append(el("div", "tool-flyout-title", t(family.label)));
    panel.append(el("div", "tool-flyout-section", t("tool.flyout.tools")));
    const displayed = familyToolForDisplay(family, store.ui.activeTool);
    for (const toolId of family.tools) {
      const tool = TOOL_BY_ID.get(toolId);
      if (!tool) continue;
      variantRow(panel, {
        label: `${t(tool.label)} · ${tool.shortcut}`,
        description: t(tool.hint),
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

function renderShapeOptions(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", t("tool.family.shapes")));
  panel.append(el("div", "tool-flyout-section", t("tool.flyout.tools")));
  const variants = [
    ["rect", "filled"],
    ["rect", "outline"],
    ["ellipse", "filled"],
    ["ellipse", "outline"],
  ] as const;
  for (const [toolId, fill] of variants) {
    const tool = TOOL_BY_ID.get(toolId);
    if (!tool) continue;
    const filled = fill === "filled";
    const label =
      toolId === "rect"
        ? t(filled ? "toolFlyout.rectFilled" : "toolFlyout.rectOutline")
        : t(filled ? "toolFlyout.ellipseFilled" : "toolFlyout.ellipseOutline");
    const description =
      toolId === "rect"
        ? t(filled ? "toolFlyout.rectFilledHint" : "toolFlyout.rectOutlineHint")
        : t(filled ? "toolFlyout.ellipseFilledHint" : "toolFlyout.ellipseOutlineHint");
    variantRow(panel, {
      label,
      description,
      iconName: tool.icon,
      selected: store.ui.activeTool === toolId && store.ui.style.shapeFill === fill,
      onSelect: () => {
        rememberFamilyTool(toolId);
        store.setStyle({ shapeFill: fill });
        store.setTool(toolId);
        render();
      },
    });
  }

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.colour")));
  const swatches = el("div", "tool-fill-swatches");
  for (const preset of DRAW_COLOR_PRESETS) {
    const button = el("button", "tool-fill-swatch has-color");
    button.type = "button";
    button.title = drawColorLabel(preset);
    button.setAttribute("aria-label", drawColorLabel(preset));
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
    option.append(button, el("span", "tool-fill-label", drawColorLabel(preset)));
    swatches.append(option);
  }
  panel.append(swatches);
  const custom = el("input", "color-swatch");
  custom.type = "color";
  setColorInput(custom, store.ui.style.color, store.ui.style.color);
  custom.setAttribute("aria-label", t("toolFlyout.colour"));
  custom.addEventListener("change", () => {
    store.setStyle({ color: colorInputValue(custom, store.ui.style.color) });
    render();
  });
  panel.append(colorWithEyedropper(custom, t("toolFlyout.colour")));

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.strokeWidth")));
  const widths = el("div", "tool-width-options");
  for (const value of STROKE_WIDTH_OPTIONS) {
    const button = el("button", "tool-width-option", `${value} pt`);
    button.type = "button";
    button.classList.toggle("is-selected", Math.abs(store.ui.style.strokeWidth - value) < 0.01);
    button.addEventListener("click", () => {
      store.setStyle({ strokeWidth: value });
      render();
    });
    widths.append(button);
  }
  panel.append(widths);

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.lineStyle")));
  const lineStyles = el("div", "tool-width-options");
  for (const [dashed, label] of [
    [false, t("toolFlyout.solid")],
    [true, t("toolFlyout.dashed")],
  ] as const) {
    const button = el("button", "tool-width-option", label);
    button.type = "button";
    button.classList.toggle("is-selected", store.ui.style.dashed === dashed);
    button.addEventListener("click", () => {
      store.setStyle({ dashed });
      render();
    });
    lineStyles.append(button);
  }
  panel.append(lineStyles);
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
  panel.append(el("div", "tool-flyout-title", t("toolFlyout.area")));
  panel.append(el("div", "tool-flyout-section", t("toolFlyout.shape")));
  const shapes: Array<{ id: AreaShape; label: string; description: string; iconName: string }> = [
    {
      id: "polygon",
      label: t("toolFlyout.polygon"),
      description: t("toolFlyout.clickCorner"),
      iconName: "area",
    },
    {
      id: "rectangle",
      label: t("toolFlyout.rectangle"),
      description: t("toolFlyout.dragQuick"),
      iconName: "rect",
    },
    {
      id: "ellipse",
      label: t("toolFlyout.ellipse"),
      description: t("toolFlyout.dragOval"),
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

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.mode")));
  const modes: Array<{ id: AreaMode; label: string; description: string; iconName: string }> = [
    {
      id: "add",
      label: t("toolFlyout.addArea"),
      description: t("toolFlyout.addsTotal"),
      iconName: "plus",
    },
    {
      id: "subtract",
      label: t("toolFlyout.deductArea"),
      description: t("toolFlyout.subtractsTotal"),
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
  panel.append(el("div", "tool-flyout-note", t("toolFlyout.modeNote")));
}

function renderCloud(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", t("toolFlyout.revisionCloud")));

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.form")));
  variantRow(panel, {
    label: t("toolFlyout.cloud"),
    description: t("toolFlyout.shapeOnly"),
    iconName: "cloud",
    selected: !store.ui.cloudText,
    onSelect: () => {
      store.setCloudText(false);
      render();
    },
  });
  variantRow(panel, {
    label: t("toolFlyout.cloudText"),
    description: t("toolFlyout.textBoxLeader"),
    iconName: "callout",
    selected: store.ui.cloudText,
    onSelect: () => {
      store.setCloudText(true);
      render();
    },
  });

  panel.append(el("div", "tool-flyout-section", t("toolFlyout.fill")));
  const swatches = el("div", "tool-fill-swatches");
  for (const preset of CLOUD_FILL_PRESETS) {
    const button = el("button", "tool-fill-swatch");
    button.type = "button";
    button.title = cloudFillLabel(preset.id);
    button.setAttribute(
      "aria-label",
      t("toolFlyout.cloudFillAria", { name: cloudFillLabel(preset.id) }),
    );
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
    option.append(button, el("span", "tool-fill-label", cloudFillLabel(preset.id)));
    swatches.append(option);
  }
  panel.append(swatches);
  panel.append(el("div", "tool-flyout-note", t("toolFlyout.fillNote")));
}

function renderHighlight(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", t("toolFlyout.highlight")));
  const entries: Array<{
    id: HighlightShape;
    label: string;
    description: string;
    iconName: string;
  }> = [
    {
      id: "stroke",
      label: t("toolFlyout.pen"),
      description: t("toolFlyout.freehand"),
      iconName: "highlight",
    },
    {
      id: "rectangle",
      label: t("toolFlyout.rectangle"),
      description: t("toolFlyout.translucentBox"),
      iconName: "rect",
    },
    {
      id: "polygon",
      label: t("toolFlyout.polygon"),
      description: t("toolFlyout.translucentArea"),
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
  panel.append(el("div", "tool-flyout-section", t("toolFlyout.colour")));
  renderColorSwatches(panel, render);
}

function renderCallout(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", t("toolFlyout.callout")));
  panel.append(el("div", "tool-flyout-section", t("toolFlyout.leaderColour")));
  renderColorSwatches(panel, render);
  panel.append(el("div", "tool-flyout-note", t("toolFlyout.calloutNote")));
}

function renderArrow(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", t("toolFlyout.arrow")));
  panel.append(el("div", "tool-flyout-section", t("toolFlyout.heads")));
  variantRow(panel, {
    label: t("toolFlyout.single"),
    description: t("toolFlyout.arrowEnd"),
    iconName: "arrow",
    selected: store.ui.arrowHeads === "end",
    onSelect: () => {
      store.setArrowHeads("end");
      render();
    },
  });
  variantRow(panel, {
    label: t("toolFlyout.double"),
    description: t("toolFlyout.bothEnds"),
    iconName: "line",
    selected: store.ui.arrowHeads === "both",
    onSelect: () => {
      store.setArrowHeads("both");
      render();
    },
  });
  panel.append(el("div", "tool-flyout-section", t("toolFlyout.colour")));
  renderColorSwatches(panel, render);
}

function renderStamp(panel: HTMLElement, render: () => void): void {
  panel.append(el("div", "tool-flyout-title", t("toolFlyout.stamp")));
  panel.append(el("div", "tool-flyout-section", t("toolFlyout.status")));
  const presets = store.project?.settings.stampPresets ?? [];
  if (!presets.length) {
    panel.append(el("div", "tool-flyout-note", t("toolFlyout.noPresets")));
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
    el("span", "tool-variant-label", t("toolFlyout.custom")),
    el("span", "tool-variant-description", t("toolFlyout.oneOff")),
  );
  custom.append(customMark, customIcon, customText);
  custom.addEventListener("click", () => {
    closeToolFlyout();
    void textDialog(
      t("context.customStampTitle"),
      t("context.customStampSubtitle"),
      store.ui.stampText,
      t("context.statusPlaceholder"),
    ).then((value) => {
      if (value !== null && value.trim()) store.setStampText(value.trim());
    });
  });
  panel.append(custom);
  panel.append(el("div", "tool-flyout-note", t("toolFlyout.stampNote")));
}

function renderColorSwatches(panel: HTMLElement, render: () => void): void {
  const swatches = el("div", "tool-fill-swatches");
  for (const preset of DRAW_COLOR_PRESETS) {
    const button = el("button", "tool-fill-swatch has-color");
    button.type = "button";
    button.title = drawColorLabel(preset);
    button.setAttribute("aria-label", drawColorLabel(preset));
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
    option.append(button, el("span", "tool-fill-label", drawColorLabel(preset)));
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
