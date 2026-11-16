import { t } from "../../../i18n";
import { el } from "../../../ui/dom";
import type { ScheduleColumnView, ScheduleGroup, ScheduleRow, ScheduleTotalValue } from "../model";

/**
 * Table pieces shared by the live panel and the builder preview, so the two
 * cannot drift. Headers are real `th` cells, group rows name their subtotal and
 * a row that can be revealed carries a real button instead of a clickable `tr`.
 */

export function scheduleCaption(text: string): HTMLTableCaptionElement {
  const caption = el("caption", "schedules-visually-hidden", text);
  return caption;
}

export function scheduleHead(columns: readonly ScheduleColumnView[]): HTMLTableRowElement {
  const row = el("tr");
  for (const column of columns) {
    const th = el("th");
    th.scope = "col";
    th.textContent = column.label;
    if (column.invalid) {
      th.classList.add("is-invalid");
      th.title = t("schedules.invalidField", { field: column.field });
    }
    row.append(th);
  }
  return row;
}

function cellText(cell: ScheduleRow["cells"][number] | undefined): string {
  return cell?.text ?? "";
}

function firstCell(
  row: ScheduleRow,
  columns: readonly ScheduleColumnView[],
  onNavigate?: (row: ScheduleRow) => void,
): HTMLTableCellElement {
  const cell = el("td", "schedules-first-cell");
  const text = cellText(row.cells[0]);
  if (onNavigate) {
    const button = el("button", "schedules-row-link", text || t("schedules.table.reveal"));
    button.type = "button";
    button.title = text || t("schedules.table.reveal");
    button.addEventListener("click", () => onNavigate(row));
    cell.append(button);
  } else {
    cell.textContent = text;
  }
  if (columns[0]?.invalid) cell.classList.add("is-invalid");
  return cell;
}

export function scheduleRowElement(
  row: ScheduleRow,
  columns: readonly ScheduleColumnView[],
  onNavigate?: (row: ScheduleRow) => void,
): HTMLTableRowElement {
  const element = el("tr", "schedules-row");
  element.append(firstCell(row, columns, onNavigate));
  for (let index = 1; index < columns.length; index += 1) {
    const cell = el("td", columns[index].numeric ? "is-numeric" : "");
    cell.textContent = cellText(row.cells[index]);
    if (columns[index].invalid) cell.classList.add("is-invalid");
    element.append(cell);
  }
  return element;
}

export function scheduleGroupRowElement(
  group: ScheduleGroup,
  columnCount: number,
): HTMLTableRowElement {
  const row = el("tr", "schedules-group-row");
  const cell = el("td");
  cell.colSpan = Math.max(1, columnCount);
  cell.append(
    el("span", "schedules-group-label", group.label),
    el("span", "schedules-group-count", String(group.rows.length)),
  );
  for (const subtotal of group.subtotals) {
    cell.append(el("span", "schedules-group-total", `${subtotal.label}: ${subtotal.text}`));
  }
  row.append(cell);
  return row;
}

export function scheduleTotalRow(
  totals: readonly ScheduleTotalValue[],
  columns: readonly ScheduleColumnView[],
): HTMLTableRowElement {
  const row = el("tr", "schedules-total-row");
  const label = el("th", "schedules-total-label", t("schedules.table.total"));
  label.scope = "row";
  row.append(label);
  for (let index = 1; index < columns.length; index += 1) {
    const total = totals.find((entry) => entry.field === columns[index].field);
    const cell = el("td", columns[index].numeric ? "is-numeric" : "");
    cell.textContent = total?.text ?? "";
    if (total?.mixedUnits) {
      cell.classList.add("is-mixed");
      cell.title = t("schedules.mixedUnits");
    }
    row.append(cell);
  }
  return row;
}

export function scheduleEmptyRow(columnCount: number, text: string): HTMLTableRowElement {
  const row = el("tr", "schedules-empty-row");
  const cell = el("td");
  cell.colSpan = Math.max(1, columnCount);
  cell.textContent = text;
  row.append(cell);
  return row;
}
