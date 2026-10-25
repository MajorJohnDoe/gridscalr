import { store } from "../state/store";
import type { AreaUnit, LengthUnit } from "../model/types";
import { AREA_UNITS, LENGTH_UNITS } from "../model/units";
import { el, option } from "./dom";
import { openSettingsDialog } from "./settingsDialog";

let optionsRoot: HTMLElement | null = null;
let optionsAnchor: HTMLElement | null = null;
let optionsCleanup: (() => void) | null = null;

export function openCanvasOptions(anchor: HTMLElement): void {
  if (optionsRoot) {
    closeCanvasOptions();
    return;
  }
  const project = store.project;
  if (!project) return;

  const root = el("div", "canvas-options-root");
  const panel = el("div", "canvas-options");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Canvas options");
  root.append(panel);
  document.body.append(root);
  optionsRoot = root;
  optionsAnchor = anchor;

  const render = () => {
    panel.replaceChildren();
    const title = el("div", "canvas-options-title");
    title.append(
      el("span", "", "Canvas"),
      el("span", "canvas-options-subtitle", "Units and guides"),
    );
    panel.append(title);

    const units = el("section", "canvas-options-section");
    units.append(el("h3", "canvas-options-heading", "Units"));
    units.append(
      unitField("Length", LENGTH_UNITS, project.settings.lengthUnit, (value) => {
        store.mutate((current) => {
          current.settings.lengthUnit = value as LengthUnit;
        }, "change");
      }),
    );
    units.append(
      unitField("Area", AREA_UNITS, project.settings.areaUnit, (value) => {
        store.mutate((current) => {
          current.settings.areaUnit = value as AreaUnit;
        }, "change");
      }),
    );
    panel.append(units);

    const guides = el("section", "canvas-options-section");
    guides.append(el("h3", "canvas-options-heading", "Guides"));
    guides.append(
      toggleRow("Snap", "snapToGeometry", "Snap to markup geometry"),
      toggleRow("Grid", "showGrid", "Show the drawing grid"),
      toggleRow("Scale line", "showCalibration", "Show the calibration line and label"),
    );
    panel.append(guides);

    const settings = el(
      "button",
      "btn btn-small btn-ghost canvas-options-settings",
      "Project settings…",
    );
    settings.type = "button";
    settings.addEventListener("click", () => {
      closeCanvasOptions();
      openSettingsDialog();
    });
    panel.append(settings);
  };

  const unitField = (
    label: string,
    units: readonly { id: string; label: string }[],
    current: string,
    onChange: (value: string) => void,
  ): HTMLElement => {
    const field = el("label", "canvas-option-field");
    field.append(el("span", "canvas-option-label", label));
    const select = el("select", "select");
    select.setAttribute("aria-label", `${label} unit`);
    for (const unit of units) {
      select.append(option(unit.id, unit.label, unit.id === current));
    }
    select.addEventListener("change", () => onChange(select.value));
    field.append(select);
    return field;
  };

  const toggleRow = (
    label: string,
    key: "snapToGeometry" | "showGrid" | "showCalibration",
    title: string,
  ): HTMLButtonElement => {
    const active = Boolean(store.project?.settings[key]);
    const button = el("button", `canvas-option-toggle${active ? " is-on" : ""}`);
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-pressed", String(active));
    button.innerHTML = `<span class="canvas-option-indicator${active ? " is-on" : ""}"></span><span>${label}</span>`;
    button.addEventListener("click", () => {
      const next = !store.project?.settings[key];
      store.mutate((project) => {
        project.settings[key] = next;
      }, "change");
      button.classList.toggle("is-on", next);
      button.setAttribute("aria-pressed", String(next));
      button.querySelector(".canvas-option-indicator")?.classList.toggle("is-on", next);
    });
    return button;
  };

  render();
  const rect = anchor.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 7}px`;
  panel.style.left = `${rect.left}px`;
  const box = panel.getBoundingClientRect();
  if (box.right > window.innerWidth - 8) {
    panel.style.left = `${Math.max(8, window.innerWidth - box.width - 8)}px`;
  }
  if (box.bottom > window.innerHeight - 8) {
    panel.style.top = `${Math.max(8, rect.top - box.height - 7)}px`;
  }

  const outside = (event: MouseEvent) => {
    if (!optionsRoot) return;
    const target = event.target as Node;
    if (optionsRoot.contains(target) || anchor.contains(target)) return;
    closeCanvasOptions();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeCanvasOptions();
      anchor.focus();
    }
  };
  document.addEventListener("mousedown", outside, true);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", closeCanvasOptions);
  window.addEventListener("blur", closeCanvasOptions);
  optionsCleanup = () => {
    document.removeEventListener("mousedown", outside, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", closeCanvasOptions);
    window.removeEventListener("blur", closeCanvasOptions);
  };
  anchor.setAttribute("aria-expanded", "true");
  panel.querySelector<HTMLElement>("select, input, button")?.focus();
}

export function closeCanvasOptions(): void {
  if (!optionsRoot) return;
  const root = optionsRoot;
  const anchor = optionsAnchor;
  optionsRoot = null;
  optionsAnchor = null;
  optionsCleanup?.();
  optionsCleanup = null;
  root.remove();
  anchor?.setAttribute("aria-expanded", "false");
}
