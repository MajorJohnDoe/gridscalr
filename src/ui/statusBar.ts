import { pageCalibration, pageScale, pageScaleLocked } from "../model/calibration";
import { formatCoordinate, formatScale } from "../model/units";
import { store } from "../state/store";
import { clear, el, escapeHtml } from "./dom";
import type { ShellRefs } from "./shell";

export function updateStatus(refs: ShellRefs): void {
  const project = store.project;
  clear(refs.statusCalibration);
  clear(refs.statusCoords);
  clear(refs.statusLayer);

  if (!project) {
    refs.statusCalibration.append(chip("No drawing open", "warning"));
    return;
  }

  const calibration = pageCalibration(project, store.ui.page);
  const scale = pageScale(project, store.ui.page);
  const scaleLocked = pageScaleLocked(project, store.ui.page);
  refs.statusCalibration.append(
    calibration
      ? chip(
          `${scaleLocked ? "Scale locked" : "Calibrated"} · ${formatScale(scale, calibration)}`,
          "calibrated",
        )
      : chip("No scale on this page", "warning"),
  );

  const cursor = store.ui.cursor;
  const coords = cursor
    ? `X ${formatCoordinate(cursor.x, scale, project.settings.lengthUnit)}  Y ${formatCoordinate(cursor.y, scale, project.settings.lengthUnit)} ${scale ? project.settings.lengthUnit : "pt"}`
    : "X —  Y —";
  refs.statusCoords.innerHTML = `<span class="status-label">Cursor</span> <span class="status-value">${coords}</span>`;
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  refs.statusLayer.innerHTML = active
    ? `<span class="status-label">Layer</span> <span class="status-value" style="color:${active.color}">${escapeHtml(active.name)}</span>`
    : "";
}

function chip(text: string, kind: "calibrated" | "warning"): HTMLElement {
  const node = el("span", `status-chip${kind === "calibrated" ? " is-calibrated" : " is-warning"}`);
  node.innerHTML = `<span class="status-dot"></span>`;
  node.append(document.createTextNode(text));
  return node;
}
