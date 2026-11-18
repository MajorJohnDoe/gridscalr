import { CLOUD_FILL_PRESETS, cloudFillLabel, type CloudFillPreset } from "../model/cloud";
import { stampStatusColor } from "../model/stamps";
import { DRAW_COLOR_PRESETS, STROKE_WIDTH_OPTIONS, drawColorLabel } from "../model/style";
import type { HighlightShape } from "../model/types";
import { store, type ToolId } from "../state/store";
import { renderMeasurementPanel } from "../features/measurementFlyout";
import { colorInputValue, colorWithEyedropper, setColorInput } from "./colorPicker";
import { textDialog } from "./dialogs";
import { el, option } from "./dom";
import {
  attachFlyoutPressHandlers as attachPressHandlers,
  closeFlyout as closeToolFlyout,
  mountFlyout,
} from "./flyoutHost";
import type { MessageKey } from "../i18n";
import { icon } from "./icons";
import {
  familyForTool,
  familyToolForDisplay,
  hasToolVariants,
  rememberFamilyTool,
  TOOL_BY_ID,
  type ToolFamily,
} from "./toolDefs";
import { variantRow } from "./variantRow";
import { t } from "../i18n";

interface VariantFlyout {
  label: MessageKey;
  render: (panel: HTMLElement, render: () => void, toolId: string) => void;
}

/**
 * Every flyout a variant tool can show, keyed by the tool's own id. The keys
 * are asserted against the tool metadata in `tests/toolFlyouts.test.ts`, so a
 * tool that declares `variantFlyout` without a panel fails instead of silently
 * opening nothing.
 */
const VARIANT_FLYOUTS: Record<string, VariantFlyout> = {
  cloud: {
    label: "tool.flyout.cloudVariants",
    render: (panel, render) => renderCloud(panel, render),
  },
  highlight: {
    label: "tool.flyout.highlightVariants",
    render: (panel, render) => renderHighlight(panel, render),
  },
  callout: {
    label: "tool.flyout.calloutColours",
    render: (panel, render) => renderCallout(panel, render),
  },
  stamp: {
    label: "tool.flyout.stampPresets",
    render: (panel, render) => renderStamp(panel, render),
  },
  arrow: {
    label: "tool.flyout.arrowVariants",
    render: (panel, render) => renderArrow(panel, render),
  },
  line: {
    label: "tool.flyout.lineOptions",
    render: (panel, render, toolId) => renderLineOptions(panel, render, toolId),
  },
  polyline: {
    label: "tool.flyout.pipeOptions",
    render: (panel, render, toolId) => renderLineOptions(panel, render, toolId),
  },
};

/** The tool ids that own a variant flyout panel. */
export const VARIANT_FLYOUT_IDS: readonly string[] = Object.keys(VARIANT_FLYOUTS);

/**
 * Opens the variant flyout for a tool on a normal click, long-press or
 * right-click. The rail's own click handler still selects the tool first, so
 * one click keeps the direct-selection path; opening changes no tool.
 */
export function attachToolFlyout(button: HTMLButtonElement, toolId: string): void {
  if (!hasToolVariants(toolId)) return;
  button.classList.add("has-variants");
  button.setAttribute("aria-haspopup", "menu");
  attachPressHandlers(button, () => openToolFlyout(button, toolId), true);
}

/**
 * Opens the shared rail slot for a tool family on a normal click, long-press or
 * right-click. The rail's own click handler still selects the last-used member,
 * so one click keeps the previous direct-selection path.
 */
export function attachToolFamilyFlyout(button: HTMLButtonElement, family: ToolFamily): void {
  button.classList.add("has-variants");
  attachPressHandlers(button, () => openToolFamilyFlyout(button, family), true);
}

/** Attaches the measurement settings flyout to a measurement tool rail slot. */
export function attachMeasurementFlyout(button: HTMLButtonElement, toolId: ToolId): void {
  button.classList.add("has-variants");
  button.setAttribute("aria-haspopup", "dialog");
  attachPressHandlers(button, () => openMeasurementFlyout(button, toolId), true);
}

export function openToolVariants(anchor: HTMLElement, toolId: string): void {
  if (!hasToolVariants(toolId)) return;
  openToolFlyout(anchor, toolId);
}

/** Opens a shared tool-family menu from the context bar. */
export function openToolFamilyVariants(anchor: HTMLElement, family: ToolFamily): void {
  openToolFamilyFlyout(anchor, family);
}

export interface MeasurementFlyoutOptions {
  /** Called after a setting changes so the context-bar summary can refresh. */
  onChange?: () => void;
}

/**
 * Opens the one measurement settings flyout. The rail slot and the compact
 * context-bar summary both call this, so there is no second editor.
 */
export function openMeasurementFlyout(
  anchor: HTMLElement,
  toolId: ToolId,
  options: MeasurementFlyoutOptions = {},
): void {
  if (!store.project || store.readOnly) return;
  const family = familyForTool(toolId);
  const target = family
    ? family.tools.includes(store.ui.activeTool)
      ? store.ui.activeTool
      : familyToolForDisplay(family, store.ui.activeTool)
    : toolId;
  if (target !== store.ui.activeTool) {
    if (family) rememberFamilyTool(target);
    store.setTool(target);
  }
  mountFlyout(
    anchor,
    t("measureOptions.title"),
    (panel, rerender) => {
      if (family) renderMeasurementMembers(panel, family);
      renderMeasurementPanel(panel, {
        tool: store.ui.activeTool,
        rerender,
        onChange: options.onChange,
      });
    },
    { role: "dialog", focus: true, returnFocus: true, className: "is-measurement" },
  );
}

function renderMeasurementMembers(panel: HTMLElement, family: ToolFamily): void {
  panel.append(el("div", "tool-flyout-section", t("tool.flyout.tools")));
  const group = el("div", "tool-flyout-choices");
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", t(family.label));
  panel.append(group);
  const displayed = familyToolForDisplay(family, store.ui.activeTool);
  for (const member of family.tools) {
    const tool = TOOL_BY_ID.get(member);
    if (!tool) continue;
    variantRow(panel, {
      label: `${t(tool.label)} · ${tool.shortcut}`,
      description: t(tool.hint),
      iconName: tool.icon,
      selected: displayed === member,
      role: "radio",
      container: group,
      onSelect: () => {
        rememberFamilyTool(member);
        store.setTool(member);
        closeToolFlyout();
      },
    });
  }
}

function openToolFlyout(button: HTMLElement, toolId: string): void {
  const entry = VARIANT_FLYOUTS[toolId];
  if (!entry) return;
  store.setTool(toolId as ToolId);
  mountFlyout(button, t(entry.label), (panel, rerender) => entry.render(panel, rerender, toolId));
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
      void import("../features/schematics").then((module) => module.openLineTypeDialog());
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

function openToolFamilyFlyout(button: HTMLElement, family: ToolFamily): void {
  if (family.id === "rect-ellipse") {
    mountFlyout(
      button,
      t("tool.family.shapes"),
      (panel, rerender) => renderShapeOptions(panel, rerender),
      { focus: true, returnFocus: true },
    );
    return;
  }
  mountFlyout(
    button,
    t("tool.familyTools", { name: t(family.label) }),
    (panel) => {
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
    },
    { focus: true, returnFocus: true },
  );
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
