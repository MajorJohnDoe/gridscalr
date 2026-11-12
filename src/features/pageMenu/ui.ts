import { t } from "../../i18n";
import { pageBuilding, pageDisplayName, pageFloor, pageNumber } from "../../model/pages";
import type { PageId, Project } from "../../model/types";
import { showModal } from "../../ui/dialogs";
import { el, option } from "../../ui/dom";
import { store } from "../../state/store";
import { PAGE_MENU_HINT_ID, type PageInsertTarget, type PageMovePosition } from "./model";

/** Page-menu dialogs: target labels, insert confirmation, move position and locations. */

/** Visually hidden hint referenced by `aria-describedby` on every page card. */
export function pageMenuHint(): HTMLElement {
  const hint = el("p", "page-reorder-hint", t("page.menuHint"));
  hint.id = PAGE_MENU_HINT_ID;
  return hint;
}

function namedPosition(position: string, name?: string): string {
  return name ? t("page.positionNamed", { position, name }) : position;
}

/** "before page 3 — Sheet A-101" for the menu and the confirmation. */
export function insertPositionLabel(target: PageInsertTarget): string {
  const position =
    target.direction === "after"
      ? t("page.insertPositionAfter", { page: target.page })
      : t("page.insertPositionBefore", { page: target.page });
  return namedPosition(position, target.name);
}

/** "before page 3 — Sheet A-101", or "at the end of the project". */
export function movePositionLabel(position: PageMovePosition): string {
  if (!position.pageId || !position.page) return t("page.moveToEnd");
  return namedPosition(t("page.moveBeforePage", { page: position.page }), position.name);
}

/** A page label for a dialog subtitle. */
export function pagePositionLabel(project: Project, pageId: PageId): string {
  const page = pageNumber(project, pageId);
  const name = pageDisplayName(project, pageId);
  return name ? t("page.locationSubtitle", { page, name }) : t("page.titleFallback", { page });
}

/** Confirms an insert and repeats the exact target position. */
export function insertPageDialog(position: string): Promise<boolean> {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("page.insertMessage", { position })));
  return showModal({
    title: t("page.insertTitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("page.insertConfirm"), value: "insert", primary: true },
    ],
  }).then((value) => value === "insert");
}

export interface MovePageDialogInput {
  subtitle: string;
  positions: readonly PageMovePosition[];
}

/**
 * Picks the position for a page move. Every option names the page it lands
 * before, or the end of the project, so the result is predictable before it is
 * applied. Returns the 0-based insertion index or null.
 */
export function movePageDialog(input: MovePageDialogInput): Promise<number | null> {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("page.moveMessage")));
  const field = el("label", "field");
  field.append(el("span", "field-label", t("page.moveTarget")));
  const select = el("select", "select");
  for (const position of input.positions) {
    select.append(option(String(position.index), movePositionLabel(position)));
  }
  field.append(select);
  body.append(field);
  return showModal({
    title: t("page.moveTitle"),
    subtitle: input.subtitle,
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("page.moveConfirm"), value: "move", primary: true },
    ],
    onMount: () => select.focus(),
  }).then((value) => (value === "move" ? Number(select.value) : null));
}

function locationValues(project: Project, field: "building" | "floor"): string[] {
  const values = new Set<string>();
  for (const record of project.pages) {
    const value = field === "building" ? record.state.building?.trim() : record.state.floor?.trim();
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

/** Edits the optional building and floor labels of one page. */
export function pageLocationDialog(project: Project, pageId: PageId, page: number): void {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("page.locationNote")));

  const buildingField = el("label", "field");
  buildingField.append(el("span", "field-label", t("page.building")));
  const building = el("input", "input");
  building.type = "text";
  building.maxLength = 80;
  building.value = pageBuilding(project, pageId) ?? "";
  building.placeholder = t("page.buildingPlaceholder");
  const buildingList = el("datalist");
  buildingList.id = `page-building-options-${page}`;
  for (const value of locationValues(project, "building")) {
    const item = el("option");
    item.value = value;
    buildingList.append(item);
  }
  building.setAttribute("list", buildingList.id);
  buildingField.append(building, buildingList);

  const floorField = el("label", "field");
  floorField.append(el("span", "field-label", t("page.floor")));
  const floor = el("input", "input");
  floor.type = "text";
  floor.maxLength = 80;
  floor.value = pageFloor(project, pageId) ?? "";
  floor.placeholder = t("page.floorPlaceholder");
  const floorList = el("datalist");
  floorList.id = `page-floor-options-${page}`;
  for (const value of locationValues(project, "floor")) {
    const item = el("option");
    item.value = value;
    floorList.append(item);
  }
  floor.setAttribute("list", floorList.id);
  floorField.append(floor, floorList);

  body.append(buildingField, floorField);
  const locationName = pageDisplayName(project, pageId);
  void showModal({
    title: t("page.location"),
    subtitle: locationName
      ? t("page.locationSubtitle", { page, name: locationName })
      : t("page.titleFallback", { page }),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.apply"), value: "apply", primary: true },
    ],
  }).then((value) => {
    if (value !== "apply") return;
    const nextBuilding = building.value.replace(/\s+/g, " ").trim().slice(0, 80);
    const nextFloor = floor.value.replace(/\s+/g, " ").trim().slice(0, 80);
    store.mutate((current) => {
      const record = current.pages.find((entry) => entry.id === pageId);
      if (!record) return;
      if (nextBuilding) record.state.building = nextBuilding;
      else delete record.state.building;
      if (nextFloor) record.state.floor = nextFloor;
      else delete record.state.floor;
    }, "change");
  });
}
