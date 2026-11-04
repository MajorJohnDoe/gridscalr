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
import { templateDocumentForPage } from "../features/schematics/model/sheetDocument";
import { store } from "../state/store";
import { clear, el, escapeHtml } from "./dom";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import type { PopoverItem } from "./popover";
import { showPopover } from "./popover";
import type { ShellRefs } from "./shell";
import { t } from "../i18n";

/** Signature of the page scale chip, so pointer moves do not rebuild the DOM. */
let scaleChipKey = "";
/** Same idea for the persistent autosave warning. */
let warningKey: string | null = null;

/** Forces the next update to rebuild the cached chips after a language change. */
export function resetStatusBar(): void {
  scaleChipKey = "";
  warningKey = null;
}

export function updateStatus(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project;
  clear(refs.statusCoords);
  clear(refs.statusLayer);

  // Autosave failures stay visible until a later autosave succeeds, so the
  // warning cannot scroll away like the toast does. Only rebuild on change:
  // updateStatus also runs for every cursor move.
  const autosaveMessage = store.autosaveError?.message ?? null;
  if (autosaveMessage !== warningKey) {
    warningKey = autosaveMessage;
    clear(refs.statusWarning);
    if (autosaveMessage) {
      const chip = el("button", "status-chip is-warning status-chip-action");
      chip.type = "button";
      chip.innerHTML = `<span class="status-dot"></span>`;
      chip.append(document.createTextNode(t("status.autosaveFailing")));
      chip.title = t("status.autosaveTitle");
      chip.addEventListener("click", () => actions.reportProblem());
      refs.statusWarning.append(chip);
    }
  }

  if (!project) {
    scaleChipKey = "";
    clear(refs.statusCalibration);
    refs.statusCalibration.append(warningChip(t("status.noDrawing")));
    return;
  }

  const page = store.ui.page;
  const calibration = pageCalibration(project, page);
  const scale = pageScale(project, page);
  const locked = pageScaleLocked(project, page);
  const isSheet = templateDocumentForPage(project, page) ? 1 : 0;
  const key = `${project.id}|${page}|${calibration ? 1 : 0}|${locked ? 1 : 0}|${scale}|${isSheet}`;
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
    refs.statusCoords.innerHTML = `<span class="status-label">${t("status.position")}</span> <span class="status-value">${coords}</span>`;
  } else {
    refs.statusCoords.innerHTML = `<span class="status-label">${t("status.position")}</span> <span class="status-value">X —  Y —</span>`;
  }
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  refs.statusLayer.innerHTML = active
    ? `<span class="status-label">${t("status.layer")}</span> <span class="status-value" style="color:${active.color}">${escapeHtml(active.name)}</span>`
    : "";
}

/**
 * The page scale chip doubles as the scale menu: recalibrate, set a manual
 * ratio, lock or clear without opening the Properties panel.
 */
function scaleChip(project: Project, actions: PanelActions): HTMLElement {
  const page = store.ui.page;
  if (templateDocumentForPage(project, page)) {
    const chip = el("span", "status-chip");
    chip.append(document.createTextNode(t("status.sheet")));
    return chip;
  }
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
        ? `${locked ? t("status.scaleLocked") : t("status.calibrated")} · ${formatScaleRatio(
            scaleRatio(pageScale(project, page)),
          )}`
        : t("status.noScale"),
    ),
  );
  const caret = el("span", "status-chip-caret");
  caret.innerHTML = icon("chevronRight", 10);
  button.append(caret);
  button.title = scaleTooltip(project, page);
  button.setAttribute(
    "aria-label",
    `${calibration ? t("status.pageScale") : t("status.noPageScale")} ${t(
      "status.openScaleOptions",
    )}`,
  );
  button.setAttribute("aria-haspopup", "menu");
  button.addEventListener("click", () => showPopover(button, scaleItems(project, actions)));
  return button;
}

function scaleTooltip(project: Project, page: number): string {
  const calibration = pageCalibration(project, page);
  if (!calibration) {
    return t("status.setScaleTooltip");
  }
  const lines = [
    isManualCalibration(calibration)
      ? t("status.manualScale", { ratio: formatNumber(calibration.ratio, 6) })
      : t("status.reference", {
          length: formatNumber(calibration.knownLength, 2),
          unit: calibration.unit,
        }),
    formatScale(pageScale(project, page), calibration),
  ];
  lines.push(pageScaleLocked(project, page) ? t("status.scaleIsLocked") : t("status.clickOptions"));
  return lines.join("\n");
}

function scaleItems(project: Project, actions: PanelActions): PopoverItem[] {
  const page = store.ui.page;
  const calibration = pageCalibration(project, page);
  const locked = pageScaleLocked(project, page);
  const items: PopoverItem[] = [
    {
      label: calibration ? t("status.recalibrate") : t("status.calibrate"),
      icon: "ruler",
      action: actions.startCalibration,
      disabled: locked,
    },
    {
      label: t("status.manualScaleAction"),
      icon: "grid",
      action: actions.openManualScale,
      disabled: locked,
    },
  ];
  if (calibration) {
    items.push(
      { separator: true },
      {
        label: locked ? t("status.unlockScale") : t("status.lockScale"),
        icon: locked ? "unlock" : "lock",
        action: () => actions.setScaleLock(!locked),
      },
      {
        label: t("status.clearScale"),
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
