import { t } from "../../i18n";
import type { DocumentKind } from "../../model/types";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";

export interface ProjectImportPageOption {
  page: number;
  name?: string;
  building?: string;
  floor?: string;
  itemCount: number;
  available: boolean;
}

export interface ProjectImportGroupOption {
  documentId: string;
  documentName: string;
  documentKind: DocumentKind;
  pageCount: number;
  /** True for referenced PDFs, which can be located when the file is missing. */
  canLocate: boolean;
  pages: ProjectImportPageOption[];
}

export interface ProjectImportDialogOptions {
  sourceName: string;
  fileName: string;
  /** First destination page where the selected pages will land. */
  destinationPage: number;
  groups: ProjectImportGroupOption[];
  requestThumbnail: (page: number) => Promise<string | null>;
  locateDocument: (documentId: string) => Promise<boolean>;
}

interface Tile {
  element: HTMLLabelElement;
  check: HTMLInputElement;
  image: HTMLImageElement;
  placeholder: HTMLElement;
  thumb: HTMLElement;
  page: ProjectImportPageOption;
  loading: boolean;
}

interface GroupView {
  section: HTMLElement;
  locate: HTMLButtonElement | null;
  pages: ProjectImportPageOption[];
}

/**
 * Graphical page picker for another project. Previews arrive lazily and the
 * source project is never modified. Pages are appended in source order.
 */
export async function projectImportDialog(
  options: ProjectImportDialogOptions,
): Promise<number[] | null> {
  const selected = new Set<number>();
  const tiles = new Map<number, Tile>();
  const groups = new Map<string, GroupView>();
  let primary: HTMLButtonElement | null = null;

  const body = el("div", "form-stack page-import project-import");
  const head = el("div", "page-import-head");
  const summary = el("p", "page-import-summary");
  const quick = el("div", "page-import-actions");
  const selectAll = el("button", "btn btn-small btn-ghost", t("importDialog.selectAll"));
  selectAll.type = "button";
  const clearAll = el("button", "btn btn-small btn-ghost", t("importDialog.clearAll"));
  clearAll.type = "button";
  quick.append(selectAll, clearAll);
  head.append(summary, quick);
  body.append(head);

  const source = el("p", "project-import-source");
  source.textContent = t("projectImport.source", {
    name: options.sourceName,
    file: options.fileName,
  });
  body.append(source);

  const container = el("div", "project-import-groups");
  body.append(container);

  const total = options.groups.reduce((sum, group) => sum + group.pages.length, 0);

  const sync = () => {
    const available = [...tiles.values()].filter((tile) => tile.page.available).length;
    summary.textContent = t("projectImport.summary", { selected: selected.size, total });
    selectAll.disabled = available === 0 || selected.size >= available;
    clearAll.disabled = selected.size === 0;
    if (primary) {
      primary.disabled = selected.size === 0;
      primary.textContent =
        selected.size === 1
          ? t("projectImport.importOne")
          : t("projectImport.importMany", { count: selected.size });
    }
  };

  const loadThumbnail = async (tile: Tile) => {
    if (!tile.page.available || tile.loading || tile.image.src) return;
    tile.loading = true;
    tile.element.classList.add("is-loading");
    try {
      const url = await options.requestThumbnail(tile.page.page);
      if (url) {
        tile.image.src = url;
        tile.image.hidden = false;
        tile.placeholder.hidden = true;
      } else {
        tile.thumb.classList.add("is-preview-missing");
        tile.placeholder.textContent = t("projectImport.previewMissing");
      }
    } finally {
      tile.loading = false;
      tile.element.classList.remove("is-loading");
    }
  };

  const refreshGroup = (group: ProjectImportGroupOption, view: GroupView) => {
    for (const page of group.pages) {
      page.available = true;
      const tile = tiles.get(page.page);
      if (!tile) continue;
      tile.check.disabled = false;
      tile.element.classList.remove("is-unavailable");
      tile.image.hidden = true;
      tile.image.removeAttribute("src");
      tile.placeholder.hidden = false;
      tile.thumb.classList.remove("is-preview-missing");
      tile.loading = false;
    }
    if (view.locate) view.locate.hidden = true;
    sync();
    for (const page of group.pages) {
      const tile = tiles.get(page.page);
      if (tile) observerRef.active?.unobserve(tile.element);
    }
    for (const page of group.pages) {
      const tile = tiles.get(page.page);
      if (tile) void loadThumbnail(tile);
    }
  };

  const observerRef: { active: IntersectionObserver | null } = { active: null };

  for (const group of options.groups) {
    const section = el("section", "project-import-group");
    const groupHead = el("div", "project-import-group-head");
    const title = el("span", "project-import-group-title", group.documentName);
    const meta = el(
      "span",
      "project-import-group-meta",
      t("projectImport.documentMeta", {
        kind: kindLabel(group.documentKind),
        count: group.pageCount,
      }),
    );
    groupHead.append(title, meta);

    const view: GroupView = { section, locate: null, pages: group.pages };
    if (group.canLocate && group.pages.some((page) => !page.available)) {
      const locate = el(
        "button",
        "btn btn-small btn-ghost project-import-locate",
        t("projectImport.locate"),
      );
      locate.type = "button";
      locate.setAttribute(
        "aria-label",
        t("projectImport.locateNamed", { name: group.documentName }),
      );
      locate.addEventListener("click", () => {
        void (async () => {
          locate.disabled = true;
          locate.textContent = t("projectImport.locating");
          const found = await options.locateDocument(group.documentId);
          locate.disabled = false;
          locate.textContent = t("projectImport.locate");
          if (found) refreshGroup(group, view);
        })();
      });
      view.locate = locate;
      groupHead.append(locate);
    }
    section.append(groupHead);

    const grid = el("div", "page-import-grid project-import-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", group.documentName);
    for (const page of group.pages) {
      const tile = el(
        "label",
        `page-import-tile project-import-tile${page.available ? "" : " is-unavailable"}`,
      ) as HTMLLabelElement;
      tile.dataset.page = String(page.page);
      const check = el("input", "page-import-check") as HTMLInputElement;
      check.type = "checkbox";
      check.disabled = !page.available;
      check.setAttribute(
        "aria-label",
        page.name
          ? t("projectImport.pageAriaNamed", { name: page.name })
          : t("projectImport.pageAria", { page: page.page }),
      );
      const thumb = el("div", "page-import-thumb");
      const placeholder = el("span", "page-import-placeholder", t("projectImport.loading"));
      const image = el("img", "page-import-image");
      image.alt = "";
      image.draggable = false;
      image.decoding = "async";
      image.hidden = true;
      thumb.append(placeholder, image);

      const caption = el("span", "project-import-caption");
      const name = el(
        "span",
        "project-import-page-name",
        page.name || t("importDialog.pageLabel", { page: page.page }),
      );
      const location = [page.building, page.floor].filter(Boolean).join(" · ");
      const details = el(
        "span",
        "project-import-page-meta",
        [location, t("projectImport.itemCount", { count: page.itemCount })]
          .filter(Boolean)
          .join(" · "),
      );
      caption.append(name, details);
      tile.append(check, thumb, caption);

      check.addEventListener("change", () => {
        if (check.checked) selected.add(page.page);
        else selected.delete(page.page);
        tile.classList.toggle("is-selected", check.checked);
        sync();
      });

      grid.append(tile);
      tiles.set(page.page, {
        element: tile,
        check,
        image,
        placeholder,
        thumb,
        page,
        loading: false,
      });
    }
    section.append(grid);
    container.append(section);
    groups.set(group.documentId, view);
  }

  const note = el("p", "export-note", t("projectImport.note", { page: options.destinationPage }));
  body.append(note);

  selectAll.addEventListener("click", () => {
    for (const tile of tiles.values()) {
      if (!tile.page.available) continue;
      selected.add(tile.page.page);
      tile.check.checked = true;
      tile.element.classList.add("is-selected");
    }
    sync();
  });
  clearAll.addEventListener("click", () => {
    selected.clear();
    for (const tile of tiles.values()) {
      tile.check.checked = false;
      tile.element.classList.remove("is-selected");
    }
    sync();
  });

  try {
    const result = await showModal({
      title: t("projectImport.title"),
      subtitle: t("projectImport.subtitle", { name: options.sourceName }),
      body,
      wide: true,
      actions: [
        { label: t("common.cancel"), value: "__cancel__" },
        { label: t("projectImport.importMany", { count: 0 }), value: "import", primary: true },
      ],
      onValidate: () => (selected.size === 0 ? t("projectImport.validation") : null),
      onMount: (modal) => {
        primary = modal.querySelector<HTMLButtonElement>(".modal-footer .btn-primary");
        sync();
        observerRef.active = observeTiles(container, tiles, loadThumbnail);
      },
    });
    if (result !== "import") return null;
    return [...selected].sort((a, b) => a - b);
  } finally {
    observerRef.active?.disconnect();
    for (const view of groups.values()) view.locate?.remove();
  }
}

function kindLabel(kind: DocumentKind): string {
  if (kind === "template") return t("projectImport.kind.template");
  if (kind === "tiff") return t("projectImport.kind.tiff");
  return t("projectImport.kind.pdf");
}

function observeTiles(
  root: HTMLElement,
  tiles: Map<number, Tile>,
  load: (tile: Tile) => Promise<void>,
): IntersectionObserver | null {
  if (!tiles.size || typeof IntersectionObserver === "undefined") return null;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const page = Number((entry.target as HTMLElement).dataset.page);
        const tile = tiles.get(page);
        if (!tile) continue;
        observer.unobserve(entry.target);
        void load(tile);
      }
    },
    { root, rootMargin: "160px 0px" },
  );
  for (const tile of tiles.values()) observer.observe(tile.element);
  return observer;
}
