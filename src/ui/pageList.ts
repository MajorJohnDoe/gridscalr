import {
  pageBuilding,
  pageDisplayName,
  pageFloor,
  pageLocationLabel,
  totalPageCount,
} from "../model/documents";
import type { PageSize, Project } from "../model/types";
import { store } from "../state/store";
import { el } from "./dom";
import { showModal, textDialog } from "./dialogs";
import { showPopoverAt } from "./popover";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";

interface PendingThumbnail {
  page: number;
  image: HTMLImageElement;
  placeholder: HTMLElement;
}

let thumbnailObserver: IntersectionObserver | null = null;

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

/** Updates one card when its page size arrives after the panel was rendered. */
function beginPageRename(title: HTMLElement, page: number): void {
  if (title.querySelector(".page-name-input")) return;
  const input = el("input", "page-name-input");
  input.value = title.textContent ?? "";
  input.maxLength = 80;
  input.setAttribute("aria-label", `Name for Page ${page}`);
  title.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    if (save) store.renamePage(page, input.value);
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
  for (const state of Object.values(project.pages)) {
    const value = field === "building" ? state.building?.trim() : state.floor?.trim();
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function pageLocationDialog(project: Project, page: number): void {
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      "Building and floor are used for grouping the Markups list. They are optional and belong to this sheet.",
    ),
  );

  const buildingField = el("label", "field");
  buildingField.append(el("span", "field-label", "Building"));
  const building = el("input", "input");
  building.type = "text";
  building.maxLength = 80;
  building.value = pageBuilding(project, page) ?? "";
  building.placeholder = "For example Building A";
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
  floorField.append(el("span", "field-label", "Floor"));
  const floor = el("input", "input");
  floor.type = "text";
  floor.maxLength = 80;
  floor.value = pageFloor(project, page) ?? "";
  floor.placeholder = "For example Floor 2";
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
  void showModal({
    title: "Page location",
    subtitle: `Page ${page}${pageDisplayName(project, page) ? ` · ${pageDisplayName(project, page)}` : ""}`,
    body,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: "Apply", value: "apply", primary: true },
    ],
  }).then((value) => {
    if (value !== "apply") return;
    const nextBuilding = building.value.replace(/\s+/g, " ").trim().slice(0, 80);
    const nextFloor = floor.value.replace(/\s+/g, " ").trim().slice(0, 80);
    store.mutate((current) => {
      const key = String(page);
      const pageState = current.pages[key] ?? {};
      if (nextBuilding) pageState.building = nextBuilding;
      else delete pageState.building;
      if (nextFloor) pageState.floor = nextFloor;
      else delete pageState.floor;
      if (Object.keys(pageState).length) current.pages[key] = pageState;
      else delete current.pages[key];
    }, "change");
  });
}

export function updatePageSizeLabel(refs: ShellRefs, page: number, size: PageSize): void {
  const card = refs.dockBody.querySelector<HTMLElement>(`.page-card[data-page="${page}"]`);
  if (!card) return;
  const label = card.querySelector<HTMLElement>(".page-size");
  if (label) label.textContent = `${Math.round(size.width)} × ${Math.round(size.height)} pt`;
  const thumb = card.querySelector<HTMLElement>(".page-thumb");
  if (thumb) applyThumbShape(thumb, size);
}

export function renderPages(refs: ShellRefs, actions: PanelActions): void {
  disconnectPageThumbnails();
  const project = store.project!;
  const list = el("div", "page-list");
  const total = totalPageCount(project.documents);
  const max = Math.min(total, 400);
  const pendingThumbnails = new Map<Element, PendingThumbnail>();
  for (let page = 1; page <= max; page++) {
    const card = el("button", "page-card");
    card.type = "button";
    card.dataset.page = String(page);
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
    const pageName = pageDisplayName(project, page);
    const title = el("div", "page-title", pageName ?? `Page ${page}`);
    title.title = pageName ? `${pageName} — double-click to rename` : "Double-click to rename";
    title.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginPageRename(title, page);
    });
    info.append(title);
    const location = pageLocationLabel(project, page);
    if (location) {
      const locationNode = el("div", "page-location", location);
      locationNode.title = location;
      info.append(locationNode);
    }
    const sizeText = size
      ? `${Math.round(size.width)} × ${Math.round(size.height)} pt`
      : "Loading size…";
    const sizeNode = el("div", "page-size", pageName ? `p.${page} · ${sizeText}` : sizeText);
    info.append(sizeNode);
    const badges = el("div", "page-badges");
    if (project.pages[String(page)]?.calibration) {
      badges.append(el("span", "page-badge is-calibrated", "Calibrated"));
    }
    if (project.pages[String(page)]?.scaleLocked) {
      badges.append(el("span", "page-badge", "Scale locked"));
    }
    const itemCount = project.layers.reduce(
      (count, layer) => count + layer.items.filter((item) => item.page === page).length,
      0,
    );
    if (itemCount) badges.append(el("span", "page-badge", `${itemCount} items`));
    if (badges.childElementCount) info.append(badges);
    card.append(thumb, info);
    pendingThumbnails.set(card, { page, image, placeholder: thumbNumber });
    card.setAttribute(
      "aria-label",
      `${pageName ?? `Page ${page}`}${pageName ? `, Page ${page}` : ""}${location ? `, ${location}` : ""}${size ? `, ${Math.round(size.width)} by ${Math.round(size.height)} points` : ""}`,
    );
    card.addEventListener("click", () => actions.goToPage(page, true));
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const locked = total <= 1;
      showPopoverAt(event.clientX, event.clientY, [
        {
          label: `Go to page ${page}`,
          icon: "pages",
          action: () => actions.goToPage(page, true),
        },
        {
          label: "Rename page…",
          icon: "text",
          action: () => {
            void textDialog(
              "Rename page",
              `Page ${page}`,
              pageDisplayName(project, page) ?? "",
              "Page name",
            ).then((value) => {
              if (value !== null) store.renamePage(page, value);
            });
          },
        },
        {
          label: "Set location…",
          icon: "target",
          action: () => pageLocationDialog(project, page),
        },
        {
          label: "Duplicate page…",
          icon: "copy",
          action: () => actions.duplicatePage(page),
        },
        { separator: true },
        {
          label: "Delete page…",
          icon: "trash",
          danger: true,
          disabled: locked,
          action: () => actions.deletePage(page),
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
        label: "Add pages…",
        icon: "plus",
        action: () => actions.addPages(),
      },
    ]);
  });
  refs.dockBody.append(list);
  if (total > max) {
    const note = el("div", "empty-note small", `Showing the first ${max} of ${total} pages.`);
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
