import { totalPageCount } from "../model/documents";
import { store } from "../state/store";
import { el } from "./dom";
import { icon } from "./icons";
import { showPopoverAt } from "./popover";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";

export function renderPages(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project!;
  const list = el("div", "page-list");
  const total = totalPageCount(project.documents);
  const max = Math.min(total, 400);
  for (let page = 1; page <= max; page++) {
    actions.ensurePageSize(page);
    const card = el("button", "page-card");
    card.type = "button";
    card.classList.toggle("is-active", page === store.ui.page);
    const thumb = el("div", "page-thumb");
    const size = actions.getPageSize(page);
    if (size) {
      thumb.style.aspectRatio = `${size.width} / ${size.height}`;
    }
    const thumbNumber = el("span", "page-thumb-placeholder", String(page));
    thumb.append(thumbNumber);
    const info = el("div", "page-info");
    info.append(el("div", "page-title", `Page ${page}`));
    const sizeNode = el(
      "div",
      "page-size",
      size ? `${Math.round(size.width)} × ${Math.round(size.height)} pt` : "Loading size…",
    );
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
  refs.dockBody.append(list);
  if (total > max) {
    const note = el("div", "empty-note small", `Showing the first ${max} of ${total} pages.`);
    refs.dockBody.append(note);
  }
  const footer = el("button", "btn btn-small btn-ghost", "Fit current page");
  footer.type = "button";
  footer.addEventListener("click", () => actions.goToPage(store.ui.page, true));
  const remove = el("button", "btn btn-small btn-ghost", "Delete page…");
  remove.type = "button";
  remove.disabled = total <= 1;
  remove.title =
    total <= 1
      ? "A project must keep at least one page."
      : "Delete the current page and move later pages down";
  remove.innerHTML = `${icon("trash", 13)}<span>Delete page…</span>`;
  remove.addEventListener("click", () => actions.deletePage(store.ui.page));
  refs.dockFooter.append(footer, remove);
}
