import { pageBuilding, pageDisplayName, pageFloor, pageLocationLabel } from "../model/pages";
import type { PageId, PageSize, Project } from "../model/types";
import { store } from "../state/store";
import { isBlankSheet, templateDocumentForPage } from "../features/schematics/model/sheetDocument";
import { el } from "./dom";
import { showModal, textDialog } from "./dialogs";
import { showPopoverAt } from "./popover";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { t } from "../i18n";

interface PendingThumbnail {
  page: number;
  image: HTMLImageElement;
  placeholder: HTMLElement;
}

let thumbnailObserver: IntersectionObserver | null = null;
let draggedPageId: PageId | null = null;

/** Stops observing page cards when the Pages tab is no longer mounted. */
export function disconnectPageThumbnails(): void {
  thumbnailObserver?.disconnect();
  thumbnailObserver = null;
}

function thumbWidth(size: PageSize | undefined): number {
  if (!size || size.height <= 0) return 60;
  const ratio = Math.max(0.55, Math.min(1.65, size.width / size.height));
  return Math.round(Math.max(58, Math.min(132, 82 * ratio)));
}

function applyThumbShape(thumb: HTMLElement, size: PageSize | undefined): void {
  if (!size || size.height <= 0) return;
  const width = thumbWidth(size);
  thumb.style.aspectRatio = `${size.width} / ${size.height}`;
  thumb.style.width = `${width}px`;
  thumb.style.flexBasis = `${width}px`;
}

function applyThumbnail(pending: PendingThumbnail, url: string): void {
  pending.image.src = url;
  pending.image.hidden = false;
  pending.placeholder.hidden = true;
}

function beginPageRename(title: HTMLElement, pageId: PageId, page: number): void {
  if (title.querySelector(".page-name-input")) return;
  const input = el("input", "page-name-input");
  input.value = title.textContent ?? "";
  input.maxLength = 80;
  input.setAttribute("aria-label", t("page.nameAria", { page }));
  title.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    if (save) store.renamePage(pageId, input.value);
    else store.emit("change");
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
    event.stopPropagation();
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("dblclick", (event) => event.stopPropagation());
}

function locationValues(project: Project, field: "building" | "floor"): string[] {
  const values = new Set<string>();
  for (const record of project.pages) {
    const value = field === "building" ? record.state.building?.trim() : record.state.floor?.trim();
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function pageLocationDialog(project: Project, pageId: PageId, page: number): void {
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

export function updatePageSizeLabel(refs: ShellRefs, page: number, size: PageSize): void {
  const card = refs.dockBody.querySelector<HTMLElement>(`.page-card[data-page="${page}"]`);
  if (!card) return;
  const label = card.querySelector<HTMLElement>(".page-size");
  if (label)
    label.textContent = t("page.sizePoints", {
      width: Math.round(size.width),
      height: Math.round(size.height),
    });
  const thumb = card.querySelector<HTMLElement>(".page-thumb");
  if (thumb) applyThumbShape(thumb, size);
}

function renderEmptyPages(refs: ShellRefs, actions: PanelActions): void {
  const empty = el("div", "page-list page-list-empty");
  empty.append(el("p", "empty-note", t("page.emptyProject")));
  const add = el("button", "btn btn-small", t("page.addPages"));
  add.type = "button";
  add.addEventListener("click", () => actions.addPages());
  const importPages = el("button", "btn btn-small", t("page.importProjectPages"));
  importPages.type = "button";
  importPages.addEventListener("click", () => actions.importProjectPages());
  empty.append(add, importPages);
  refs.dockBody.append(empty);
}

export function renderPages(refs: ShellRefs, actions: PanelActions): void {
  disconnectPageThumbnails();
  refs.dockBody.querySelector(".page-list")?.remove();
  const project = store.project!;
  if (!project.pages.length) {
    renderEmptyPages(refs, actions);
    return;
  }
  const list = el("div", "page-list");
  const total = project.pages.length;
  const max = Math.min(total, 400);
  const pendingThumbnails = new Map<Element, PendingThumbnail>();
  for (let page = 1; page <= max; page++) {
    const record = project.pages[page - 1];
    const pageId = record.id;
    const card = el("button", "page-card");
    card.type = "button";
    card.draggable = true;
    card.dataset.page = String(page);
    card.dataset.pageId = pageId;
    card.classList.toggle("is-active", page === store.ui.page);
    const thumb = el("div", "page-thumb");
    const size = actions.getPageSize(page);
    applyThumbShape(thumb, size);
    const thumbNumber = el("span", "page-thumb-placeholder", String(page));
    const image = el("img", "page-thumb-image");
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    image.setAttribute("aria-hidden", "true");
    image.hidden = true;
    thumb.append(thumbNumber, image);
    const cached = actions.getPageThumbnail(page);
    if (cached) applyThumbnail({ page, image, placeholder: thumbNumber }, cached);
    const info = el("div", "page-info");
    const sheetDocument = templateDocumentForPage(project, page);
    const pageName = pageDisplayName(project, pageId);
    const title = el("div", "page-title", pageName ?? t("page.titleFallback", { page }));
    title.title = pageName ? `${pageName} — double-click to rename` : t("page.doubleClickRename");
    title.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginPageRename(title, pageId, page);
    });
    info.append(title);
    const location = pageLocationLabel(project, pageId);
    if (location) {
      const locationNode = el("div", "page-location", location);
      locationNode.title = location;
      info.append(locationNode);
    }
    const sizeText = size
      ? t("page.sizePoints", { width: Math.round(size.width), height: Math.round(size.height) })
      : t("page.loadingSize");
    const sizeNode = el("div", "page-size", pageName ? `p.${page} · ${sizeText}` : sizeText);
    info.append(sizeNode);
    const badges = el("div", "page-badges");
    if (record.documentId && sheetDocument) {
      badges.append(
        el(
          "span",
          "page-badge",
          t(isBlankSheet(sheetDocument) ? "page.blankBadge" : "page.sheetBadge"),
        ),
      );
    }
    if (record.state.calibration) {
      badges.append(el("span", "page-badge is-calibrated", t("page.calibrated")));
    }
    if (record.state.scaleLocked) {
      badges.append(el("span", "page-badge", t("page.scaleLocked")));
    }
    const itemCount = project.layers.reduce(
      (count, layer) => count + layer.items.filter((item) => item.pageId === pageId).length,
      0,
    );
    if (itemCount)
      badges.append(el("span", "page-badge", t("page.itemCount", { count: itemCount })));
    if (badges.childElementCount) info.append(badges);
    card.append(thumb, info);
    pendingThumbnails.set(card, { page, image, placeholder: thumbNumber });
    card.setAttribute(
      "aria-label",
      t("page.cardAria", {
        name: pageName
          ? t("page.namedPageAria", { name: pageName, page })
          : t("page.titleFallback", { page }),
        location: location ? t("page.locationAria", { location }) : "",
        size: size
          ? t("page.sizeAria", { width: Math.round(size.width), height: Math.round(size.height) })
          : "",
      }),
    );
    card.addEventListener("click", () => actions.goToPage(page, true));
    card.addEventListener("dragstart", (event) => {
      draggedPageId = pageId;
      card.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", pageId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      draggedPageId = null;
      for (const entry of list.querySelectorAll(".page-card")) {
        entry.classList.remove("is-dragging", "is-drop-target");
      }
    });
    card.addEventListener("dragover", (event) => {
      if (!draggedPageId || draggedPageId === pageId) return;
      event.preventDefault();
      card.classList.add("is-drop-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-drop-target"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("is-drop-target");
      const source = draggedPageId ?? event.dataTransfer?.getData("text/plain") ?? null;
      draggedPageId = null;
      if (!source || source === pageId) return;
      actions.reorderPage(source, page - 1);
    });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showPopoverAt(event.clientX, event.clientY, [
        {
          label: t("page.goTo", { page }),
          icon: "pages",
          action: () => actions.goToPage(page, true),
        },
        {
          label: t("page.renameEllipsis"),
          icon: "text",
          action: () => {
            void textDialog(
              t("page.rename"),
              t("page.titleFallback", { page }),
              pageDisplayName(project, pageId) ?? "",
              t("page.name"),
            ).then((value) => {
              if (value !== null) store.renamePage(pageId, value);
            });
          },
        },
        ...(sheetDocument && !isBlankSheet(sheetDocument)
          ? [
              {
                label: t("page.editSheetFields"),
                icon: "text",
                action: () => actions.editSheetFields(page),
              },
              { separator: true as const },
            ]
          : []),
        {
          label: t("page.setLocation"),
          icon: "target",
          action: () => pageLocationDialog(project, pageId, page),
        },
        {
          label: t("page.insertBefore"),
          icon: "plus",
          action: () => actions.insertPage(pageId, page - 1),
        },
        {
          label: t("page.insertAfter"),
          icon: "plus",
          action: () => actions.insertPage(pageId, page),
        },
        {
          label: t("page.duplicate"),
          icon: "copy",
          action: () => actions.duplicatePage(pageId),
        },
        { separator: true },
        {
          label: t("page.delete"),
          icon: "trash",
          danger: true,
          action: () => actions.deletePage(pageId),
        },
      ]);
    });
    list.append(card);
  }
  list.addEventListener("contextmenu", (event) => {
    // Cards have their own menu; this one covers the empty panel area.
    if ((event.target as HTMLElement | null)?.closest(".page-card")) return;
    event.preventDefault();
    showPopoverAt(event.clientX, event.clientY, [
      {
        label: t("page.addPages"),
        icon: "plus",
        action: () => actions.addPages(),
      },
      {
        label: t("page.importProjectPages"),
        icon: "plus",
        action: () => actions.importProjectPages(),
      },
    ]);
  });
  refs.dockBody.append(list);
  if (total > max) {
    const note = el("div", "empty-note small", t("page.showingFirst", { shown: max, total }));
    refs.dockBody.append(note);
  }
  observeThumbnails(refs, actions, pendingThumbnails);
}

/**
 * Page sizes and previews are prepared only when a card approaches the visible
 * area, rendering one preview at a time. Opening a 400-page project therefore
 * stays cheap: the panel only pays for what the user can actually see.
 */
function observeThumbnails(
  refs: ShellRefs,
  actions: PanelActions,
  pending: Map<Element, PendingThumbnail>,
): void {
  if (!pending.size || typeof IntersectionObserver === "undefined") return;
  thumbnailObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const request = pending.get(entry.target);
        if (!request) continue;
        pending.delete(entry.target);
        thumbnailObserver?.unobserve(entry.target);
        actions.ensurePageSize(request.page);
        void actions.requestPageThumbnail(request.page).then((url) => {
          if (url) applyThumbnail(request, url);
        });
      }
    },
    { root: refs.dockBody, rootMargin: "240px 0px" },
  );
  for (const card of pending.keys()) thumbnailObserver.observe(card);
}
