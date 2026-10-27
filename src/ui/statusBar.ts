import {
  isManualCalibration,
  pageCalibration,
  pageScale,
  pageScaleLocked,
  scaleRatio,
} from "../model/calibration";
import {
  displayedLengthUnit,
  formatCoordinate,
  formatNumber,
  formatScale,
  formatScaleRatio,
} from "../model/units";
import type { Project } from "../model/types";
import { store } from "../state/store";
import { clear, el, escapeHtml } from "./dom";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import type { PopoverItem } from "./popover";
import { showPopover } from "./popover";
import type { ShellRefs } from "./shell";

/** Signature of the page scale chip, so pointer moves do not rebuild the DOM. */
let scaleChipKey = "";

export function updateStatus(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project;
  clear(refs.statusCoords);
  clear(refs.statusLayer);

  if (!project) {
    scaleChipKey = "";
    clear(refs.statusCalibration);
    refs.statusCalibration.append(warningChip("No drawing open"));
    return;
  }

  const page = store.ui.page;
  const calibration = pageCalibration(project, page);
  const scale = pageScale(project, page);
  const locked = pageScaleLocked(project, page);
  const key = `${project.id}|${page}|${calibration ? 1 : 0}|${locked ? 1 : 0}|${scale}`;
  if (key !== scaleChipKey) {
    scaleChipKey = key;
    clear(refs.statusCalibration);
    refs.statusCalibration.append(scaleChip(project, actions));
  }

  const cursor = store.ui.cursor;
  if (cursor) {
    // Site coordinates, not a screen cursor. Both axes share one unit so the
    // pair reads as a position; large plans switch to metres via the smart-unit
    // setting instead of showing five-digit centimetres.
    let coords: string;
    if (!scale) {
      coords = `X ${formatNumber(cursor.x, 1)} pt&nbsp;&nbsp;Y ${formatNumber(cursor.y, 1)} pt`;
    } else {
      const furthest = Math.max(Math.abs(cursor.x), Math.abs(cursor.y));
      const unit = displayedLengthUnit(
        furthest,
        scale,
        project.settings.lengthUnit,
        project.settings.smartLengthUnits,
      );
      coords = `X ${formatCoordinate(cursor.x, scale, unit)} ${unit}&nbsp;&nbsp;Y ${formatCoordinate(cursor.y, scale, unit)} ${unit}`;
    }
    refs.statusCoords.innerHTML = `<span class="status-label">Position</span> <span class="status-value">${coords}</span>`;
  } else {
    refs.statusCoords.innerHTML = `<span class="status-label">Position</span> <span class="status-value">X —  Y —</span>`;
  }
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  refs.statusLayer.innerHTML = active
    ? `<span class="status-label">Layer</span> <span class="status-value" style="color:${active.color}">${escapeHtml(active.name)}</span>`
    : "";
}

/**
 * The page scale chip doubles as the scale menu: recalibrate, set a manual
 * ratio, lock or clear without opening the Properties panel.
 */
function scaleChip(project: Project, actions: PanelActions): HTMLElement {
  const page = store.ui.page;
  const calibration = pageCalibration(project, page);
  const locked = pageScaleLocked(project, page);
  const button = el(
    "button",
    `status-chip status-chip-action${calibration ? " is-calibrated" : " is-warning"}`,
  );
  button.type = "button";
  button.innerHTML = `<span class="status-dot"></span>`;
  button.append(
    document.createTextNode(
      calibration
        ? `${locked ? "Scale locked" : "Calibrated"} · ${formatScaleRatio(scaleRatio(pageScale(project, page)))}`
        : "No scale on this page",
    ),
  );
  const caret = el("span", "status-chip-caret");
  caret.innerHTML = icon("chevronRight", 10);
  button.append(caret);
  button.title = scaleTooltip(project, page);
  button.setAttribute(
    "aria-label",
    `${calibration ? "Page scale" : "No page scale"}. Open scale options.`,
  );
  button.setAttribute("aria-haspopup", "menu");
  button.addEventListener("click", () => showPopover(button, scaleItems(project, actions)));
  return button;
}

function scaleTooltip(project: Project, page: number): string {
  const calibration = pageCalibration(project, page);
  if (!calibration) {
    return "Set the page scale: draw a reference line or enter the printed 1:N ratio.";
  }
  const lines = [
    isManualCalibration(calibration)
      ? `Manual scale 1:${formatNumber(calibration.ratio, 6)}`
      : `Reference: ${formatNumber(calibration.knownLength, 2)} ${calibration.unit}`,
    formatScale(pageScale(project, page), calibration),
  ];
  lines.push(pageScaleLocked(project, page) ? "The scale is locked." : "Click for scale options.");
  return lines.join("\n");
}

function scaleItems(project: Project, actions: PanelActions): PopoverItem[] {
  const page = store.ui.page;
  const calibration = pageCalibration(project, page);
  const locked = pageScaleLocked(project, page);
  const items: PopoverItem[] = [
    {
      label: calibration ? "Recalibrate…" : "Calibrate…",
      icon: "ruler",
      action: actions.startCalibration,
      disabled: locked,
    },
    {
      label: "Manual scale…",
      icon: "grid",
      action: actions.openManualScale,
      disabled: locked,
    },
  ];
  if (calibration) {
    items.push(
      { separator: true },
      {
        label: locked ? "Unlock scale" : "Lock scale",
        icon: locked ? "unlock" : "lock",
        action: () => actions.setScaleLock(!locked),
      },
      {
        label: "Clear scale",
        icon: "trash",
        danger: true,
        disabled: locked,
        action: actions.clearCalibration,
      },
    );
  }
  return items;
}

function warningChip(text: string): HTMLElement {
  const node = el("span", "status-chip is-warning");
  node.innerHTML = `<span class="status-dot"></span>`;
  node.append(document.createTextNode(text));
  return node;
}
