import { allRooms, measurementCategory } from "../model/categories";
import type { AreaMode, AreaShape, CountType } from "../model/types";
import { store } from "../state/store";
import { el, option } from "./dom";

let optionsRoot: HTMLElement | null = null;
let optionsAnchor: HTMLElement | null = null;
let optionsCleanup: (() => void) | null = null;

export function openMeasureOptions(anchor: HTMLElement, onChange?: () => void): void {
  if (optionsRoot) {
    closeMeasureOptions();
    return;
  }
  const project = store.project;
  if (!project) return;

  const root = el("div", "measure-options-root");
  const panel = el("div", "measure-options");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "New measurement options");
  root.append(panel);
  document.body.append(root);
  optionsRoot = root;
  optionsAnchor = anchor;

  const changed = () => onChange?.();

  const field = (label: string, control: HTMLElement): HTMLElement => {
    const wrap = el("label", "measure-option-field");
    wrap.append(el("span", "measure-option-label", label), control);
    return wrap;
  };

  const select = (
    label: string,
    entries: Array<{ value: string; label: string; selected?: boolean }>,
    onSelect: (value: string) => void,
  ): HTMLSelectElement => {
    const control = el("select", "select");
    control.setAttribute("aria-label", label);
    for (const entry of entries) {
      control.append(option(entry.value, entry.label, entry.selected));
    }
    control.addEventListener("change", () => {
      onSelect(control.value);
      changed();
    });
    return control;
  };

  const render = () => {
    panel.replaceChildren();
    const title = el("div", "measure-options-title");
    title.append(
      el("span", "", "New measurement"),
      el("span", "measure-options-subtitle", "Sticky for the next item"),
    );
    panel.append(title);

    const currentProject = store.project;
    if (!currentProject) return;
    const pendingCategory = measurementCategory(currentProject, store.ui.measureCategoryId);

    const category = select(
      "Category",
      currentProject.categories.map((entry) => ({
        value: entry.id,
        label: entry.name,
        selected: entry.id === pendingCategory?.id,
      })),
      (value) => store.setMeasureCategory(value),
    );
    panel.append(field("Category", category));

    const room = el("input", "input");
    room.type = "text";
    room.value = store.ui.measureRoom;
    room.placeholder = "Room (optional)";
    room.setAttribute("aria-label", "Room for new measurements");
    const roomList = el("datalist");
    roomList.id = "measure-option-rooms";
    for (const name of allRooms(currentProject)) roomList.append(option(name, name));
    room.setAttribute("list", roomList.id);
    room.addEventListener("input", () => {
      store.setMeasureRoom(room.value);
      changed();
    });
    const clear = el("button", "icon-btn measure-option-clear", "×");
    clear.type = "button";
    clear.title = "Clear room";
    clear.setAttribute("aria-label", "Clear room");
    clear.addEventListener("click", () => {
      room.value = "";
      store.setMeasureRoom("");
      changed();
      room.focus();
    });
    const roomWrap = el("div", "measure-option-room");
    roomWrap.append(room, clear, roomList);
    panel.append(field("Room", roomWrap));

    if (store.ui.activeTool === "area") {
      const shape = select(
        "Area shape",
        [
          { value: "polygon", label: "Polygon", selected: store.ui.measureAreaShape === "polygon" },
          {
            value: "rectangle",
            label: "Rectangle",
            selected: store.ui.measureAreaShape === "rectangle",
          },
          { value: "ellipse", label: "Ellipse", selected: store.ui.measureAreaShape === "ellipse" },
        ],
        (value) => store.setMeasureAreaShape(value as AreaShape),
      );
      panel.append(field("Shape", shape));
      const mode = select(
        "Area mode",
        [
          { value: "add", label: "Add to area", selected: store.ui.measureAreaMode === "add" },
          {
            value: "subtract",
            label: "Deduct from area",
            selected: store.ui.measureAreaMode === "subtract",
          },
        ],
        (value) => store.setMeasureAreaMode(value as AreaMode),
      );
      panel.append(field("Area", mode));
    }

    if (store.ui.activeTool === "count") {
      const type = select(
        "Object type",
        project.countTypes.map((entry) => ({
          value: entry.id,
          label: entry.label,
          selected: entry.id === store.ui.measureCountType,
        })),
        (value) => store.setMeasureCountType(value as CountType),
      );
      panel.append(field("Type", type));
    }
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
    closeMeasureOptions();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMeasureOptions();
      anchor.focus();
    }
  };
  document.addEventListener("mousedown", outside, true);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", closeMeasureOptions);
  window.addEventListener("blur", closeMeasureOptions);
  optionsCleanup = () => {
    document.removeEventListener("mousedown", outside, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", closeMeasureOptions);
    window.removeEventListener("blur", closeMeasureOptions);
  };
  anchor.setAttribute("aria-expanded", "true");
  panel.querySelector<HTMLElement>("select, input, button")?.focus();
}

export function closeMeasureOptions(): void {
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
