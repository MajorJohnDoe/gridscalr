import { el } from "./dom";
import { showModal } from "./dialogs";

export interface PageImportDialogOptions {
  fileName: string;
  pageCount: number;
  /** "new" creates the first project; "add" appends pages to the open project. */
  mode: "new" | "add";
  /** Global page after which appended pages land. */
  afterPage?: number;
  requestThumbnail: (page: number) => Promise<string | null>;
}

interface Tile {
  element: HTMLElement;
  image: HTMLImageElement;
  placeholder: HTMLElement;
}

/**
 * Lets the user choose which pages of a picked PDF or TIF become project pages.
 * Previews are rendered lazily for visible tiles, one at a time, by the caller.
 */
export async function pageImportDialog(options: PageImportDialogOptions): Promise<number[] | null> {
  const allPages = Array.from({ length: options.pageCount }, (_, index) => index + 1);
  const selected = new Set(allPages);
  const tiles = new Map<number, Tile>();
  let primary: HTMLButtonElement | null = null;

  const body = el("div", "form-stack page-import");
  const head = el("div", "page-import-head");
  const summary = el("p", "page-import-summary");
  const quick = el("div", "page-import-actions");
  const selectAll = el("button", "btn btn-small btn-ghost", "Select all");
  selectAll.type = "button";
  const selectNone = el("button", "btn btn-small btn-ghost", "Clear all");
  selectNone.type = "button";
  quick.append(selectAll, selectNone);
  head.append(summary, quick);

  const grid = el("div", "page-import-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Pages to import");

  for (const page of allPages) {
    const tile = el("label", "page-import-tile is-selected");
    tile.dataset.page = String(page);
    const check = el("input", "page-import-check") as HTMLInputElement;
    check.type = "checkbox";
    check.checked = true;
    check.setAttribute("aria-label", `Page ${page}`);
    const thumb = el("div", "page-import-thumb");
    const placeholder = el("span", "page-import-placeholder", String(page));
    const image = el("img", "page-import-image");
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    image.hidden = true;
    thumb.append(placeholder, image);
    const caption = el("span", "page-import-caption", `Page ${page}`);
    tile.append(check, thumb, caption);
    check.addEventListener("change", () => {
      if (check.checked) selected.add(page);
      else selected.delete(page);
      tile.classList.toggle("is-selected", check.checked);
      sync();
    });
    grid.append(tile);
    tiles.set(page, { element: tile, image, placeholder });
  }

  const note = el(
    "p",
    "export-note",
    options.mode === "add"
      ? `Selected pages are appended after page ${options.afterPage ?? 1}. Existing measurements keep their page numbers.`
      : "The selected pages become the first pages of the new project.",
  );
  body.append(head, grid, note);

  const sync = () => {
    summary.textContent =
      options.pageCount === 1
        ? "1 page"
        : `${selected.size} of ${options.pageCount} pages selected`;
    selectNone.disabled = selected.size === 0;
    selectAll.disabled = selected.size === options.pageCount;
    if (primary) {
      primary.disabled = selected.size === 0;
      primary.textContent =
        options.mode === "new"
          ? "Create project"
          : selected.size === 0
            ? "Add pages"
            : selected.size === 1
              ? "Add 1 page"
              : `Add ${selected.size} pages`;
    }
  };
  selectAll.addEventListener("click", () => {
    for (const page of allPages) selected.add(page);
    for (const tile of tiles.values()) {
      const check = tile.element.querySelector<HTMLInputElement>("input");
      if (check) check.checked = true;
      tile.element.classList.add("is-selected");
    }
    sync();
  });
  selectNone.addEventListener("click", () => {
    selected.clear();
    for (const tile of tiles.values()) {
      const check = tile.element.querySelector<HTMLInputElement>("input");
      if (check) check.checked = false;
      tile.element.classList.remove("is-selected");
    }
    sync();
  });

  const observers: { active: IntersectionObserver | null } = { active: null };
  try {
    const result = await showModal({
      title: options.mode === "new" ? "Choose pages" : "Add pages",
      subtitle:
        options.pageCount === 1
          ? options.fileName
          : `${options.fileName} · ${options.pageCount} pages`,
      body,
      wide: true,
      actions: [
        { label: "Cancel", value: "__cancel__" },
        { label: "Add pages", value: "import", primary: true },
      ],
      onValidate: () => (selected.size === 0 ? "Select at least one page." : null),
      onMount: (modal) => {
        primary = modal.querySelector<HTMLButtonElement>(".btn-primary");
        sync();
        observers.active = observeTiles(grid, tiles, options.requestThumbnail);
      },
    });
    if (result !== "import") return null;
    return [...selected].sort((a, b) => a - b);
  } finally {
    observers.active?.disconnect();
  }
}

function observeTiles(
  grid: HTMLElement,
  tiles: Map<number, Tile>,
  requestThumbnail: (page: number) => Promise<string | null>,
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
        void requestThumbnail(page).then((url) => {
          if (!url) return;
          tile.image.src = url;
          tile.image.hidden = false;
          tile.placeholder.hidden = true;
        });
      }
    },
    { root: grid, rootMargin: "160px 0px" },
  );
  for (const tile of tiles.values()) observer.observe(tile.element);
  return observer;
}
