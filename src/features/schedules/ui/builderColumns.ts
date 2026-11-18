import { el, option } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import { t } from "../../../i18n";
import { makeColumn, scheduleFieldInfo, scheduleFieldsForSource } from "../model";
import type { ScheduleDraft } from "../model";
import { PointerRowDrag, rowIndexAt } from "../../listInteraction";
import type { BuilderContext } from "./builderContext";

/**
 * The column picker with drag order. A pointer drag and the accessible
 * up/down buttons write the same array order, and a hidden column keeps its
 * place so showing it again does not move it. The drag is pointer-based, so a
 * desktop shell that owns OS drag-and-drop cannot swallow it.
 */

function iconButton(markup: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", "icon-btn schedules-builder-action");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = markup;
  button.addEventListener("click", onClick);
  return button;
}

function moveColumn(draft: ScheduleDraft, from: number, to: number): boolean {
  if (to < 0 || to >= draft.columns.length || from === to) return false;
  const [column] = draft.columns.splice(from, 1);
  draft.columns.splice(to, 0, column);
  return true;
}

export function columnsSection(ctx: BuilderContext): HTMLElement {
  const { project, draft } = ctx;
  const section = el("section", "schedules-builder-section");
  const head = el("div", "schedules-builder-section-head");
  head.append(el("h3", "schedules-builder-title", t("schedules.builder.columns")));

  const fields = scheduleFieldsForSource(project, draft.source);
  const addField = el("select", "select schedules-builder-field-picker");
  addField.setAttribute("aria-label", t("schedules.builder.addColumnField"));
  for (const field of fields) {
    addField.append(option(field.ref, field.invalid ? field.ref : field.label));
  }
  const add = el("button", "btn btn-small", t("schedules.builder.addColumn"));
  add.type = "button";
  add.addEventListener("click", () => {
    if (!addField.value) return;
    const info = scheduleFieldInfo(project, draft.source, addField.value);
    draft.columns.push(makeColumn(addField.value, draft.columns, info));
    ctx.rebuild();
  });
  const addRow = el("div", "schedules-builder-add");
  addRow.append(addField, add);
  head.append(addRow);
  section.append(head);

  const list = el("div", "schedules-builder-columns");
  list.setAttribute("role", "list");
  let dragIndex: number | null = null;
  let dropIndex: number | null = null;

  const columnRows = (): HTMLElement[] => [
    ...list.querySelectorAll<HTMLElement>(".schedules-builder-column"),
  ];

  const clearDropTarget = (): void => {
    dropIndex = null;
    for (const entry of columnRows()) entry.classList.remove("is-drop-target", "is-dragging");
  };

  const targetIndex = (clientY: number): number => {
    const spans = columnRows().map((entry) => {
      const rect = entry.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    return rowIndexAt(spans, clientY);
  };

  const drag = new PointerRowDrag({
    rowSelector: ".schedules-builder-column",
    handleSelector: ".schedules-builder-handle",
    canStart: () => draft.columns.length > 1,
    onStart: (row) => {
      const index = Number(row.dataset.index);
      if (!Number.isFinite(index)) return false;
      dragIndex = index;
      row.classList.add("is-dragging");
      return true;
    },
    onMove: (_x, clientY) => {
      if (dragIndex === null) return;
      const index = targetIndex(clientY);
      if (index < 0) return;
      if (dropIndex !== index) {
        for (const entry of columnRows()) {
          entry.classList.toggle("is-drop-target", Number(entry.dataset.index) === index);
        }
        dropIndex = index;
      }
    },
    onDrop: (_x, clientY) => {
      const from = dragIndex;
      const to = targetIndex(clientY);
      dragIndex = null;
      clearDropTarget();
      if (from === null || to < 0) return;
      if (moveColumn(draft, from, to)) ctx.rebuild();
    },
    onCancel: () => {
      dragIndex = null;
      clearDropTarget();
    },
  });

  draft.columns.forEach((column, index) => {
    const info = scheduleFieldInfo(project, draft.source, column.field);
    const row = el("div", "schedules-builder-column");
    row.setAttribute("role", "listitem");
    row.dataset.index = String(index);

    const handle = el("button", "icon-btn schedules-builder-handle");
    handle.type = "button";
    handle.title = t("schedules.builder.dragColumn");
    handle.setAttribute("aria-label", t("schedules.builder.dragColumnAria", { field: info.label }));
    handle.innerHTML = icon("grip", 14);

    const label = el("input", "input schedules-builder-column-label");
    label.type = "text";
    label.value = column.label ?? "";
    label.placeholder = info.label;
    label.setAttribute("aria-label", t("schedules.builder.columnLabelAria", { field: info.label }));
    label.addEventListener("input", () => {
      if (label.value.trim()) column.label = label.value;
      else delete column.label;
      ctx.refresh();
    });

    const fieldName = el("span", "schedules-builder-column-field");
    if (info.invalid) {
      fieldName.classList.add("is-invalid");
      fieldName.textContent = t("schedules.invalidField", { field: column.field });
    } else {
      fieldName.textContent = info.label;
    }

    const visibleLabel = el("label", "check-row schedules-builder-visible");
    const visible = el("input");
    visible.type = "checkbox";
    visible.checked = column.visible !== false;
    visible.setAttribute(
      "aria-label",
      t("schedules.builder.columnVisibleAria", { field: info.label }),
    );
    visible.addEventListener("change", () => {
      column.visible = visible.checked;
      ctx.refresh();
    });
    visibleLabel.append(visible, el("span", "", t("schedules.builder.visible")));

    const actions = el("div", "schedules-builder-row-actions");
    const up = iconButton(
      icon("up", 14),
      t("schedules.builder.moveUpAria", { field: info.label }),
      () => {
        if (moveColumn(draft, index, index - 1)) ctx.rebuild();
      },
    );
    up.disabled = index === 0;
    const down = iconButton(
      icon("down", 14),
      t("schedules.builder.moveDownAria", { field: info.label }),
      () => {
        if (moveColumn(draft, index, index + 1)) ctx.rebuild();
      },
    );
    down.disabled = index === draft.columns.length - 1;
    const remove = iconButton(
      icon("trash", 14),
      t("schedules.builder.removeColumnAria", { field: info.label }),
      () => {
        draft.columns = draft.columns.filter((entry) => entry !== column);
        ctx.rebuild();
      },
    );
    actions.append(up, down, remove);

    row.append(handle, fieldName, label, visibleLabel, actions);
    list.append(row);
  });

  drag.bind(list);
  if (!draft.columns.length) {
    list.append(el("p", "schedules-builder-empty", t("schedules.builder.noColumns")));
  }
  section.append(list);
  return section;
}

/** Move helper shared with the sort and total lists. */
export function moveItem<T>(list: T[], index: number, offset: -1 | 1): boolean {
  const target = index + offset;
  if (target < 0 || target >= list.length) return false;
  const [entry] = list.splice(index, 1);
  list.splice(target, 0, entry);
  return true;
}
