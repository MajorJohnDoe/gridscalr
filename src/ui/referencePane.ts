import { el } from "./dom";
import { icon } from "./icons";

export type ReferenceSource = "same" | "revision" | "drawing";

export interface ReferencePaneState {
  source: ReferenceSource;
  referenceName: string | null;
  pageCount?: number;
}

export interface ReferencePaneActions {
  setSource: (source: ReferenceSource) => void;
  open: () => void;
  close: () => void;
}

const SOURCE_LABELS: Record<ReferenceSource, string> = {
  same: "Same page",
  revision: "Revision",
  drawing: "Drawing",
};

/**
 * Compact toolbar at the top of the reference pane. It owns the source
 * selector, the reference name, Open and Close only; the pane itself stays
 * owned by SplitView.
 */
export class ReferencePaneHeader {
  readonly element: HTMLElement;
  private readonly buttons: Array<{ source: ReferenceSource; button: HTMLButtonElement }> = [];
  private readonly name: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly openButton: HTMLButtonElement;

  constructor(
    host: HTMLElement,
    private readonly actions: ReferencePaneActions,
  ) {
    this.element = el("div", "reference-bar");
    this.element.setAttribute("role", "toolbar");
    this.element.setAttribute("aria-label", "Reference pane");

    const top = el("div", "reference-bar-row");
    top.append(el("span", "reference-bar-label", "Reference"));

    const sources = el("div", "reference-sources");
    sources.setAttribute("role", "group");
    sources.setAttribute("aria-label", "Reference source");
    for (const source of ["same", "revision", "drawing"] as ReferenceSource[]) {
      const button = el("button", "reference-source", SOURCE_LABELS[source]);
      button.type = "button";
      button.dataset.source = source;
      button.addEventListener("click", () => this.actions.setSource(source));
      sources.append(button);
      this.buttons.push({ source, button });
    }

    this.name = el("span", "reference-name", "Same page");
    this.name.title = "Same page";

    this.openButton = el("button", "btn btn-small reference-open");
    this.openButton.type = "button";
    this.openButton.title = "Open a reference revision or drawing";
    this.openButton.innerHTML = `${icon("folder", 13)}<span>Open…</span>`;
    this.openButton.addEventListener("click", () => this.actions.open());

    const closeButton = el("button", "icon-btn reference-close");
    closeButton.type = "button";
    closeButton.title = "Close reference pane";
    closeButton.setAttribute("aria-label", "Close reference pane");
    closeButton.innerHTML = icon("close", 14);
    closeButton.addEventListener("click", () => this.actions.close());

    top.append(sources, this.name, this.openButton, closeButton);
    this.hint = el(
      "div",
      "reference-hint",
      "Showing the same page. To compare another revision, choose Open…",
    );
    this.element.append(top, this.hint);
    host.prepend(this.element);
    this.update({ source: "same", referenceName: null });
  }

  update(state: ReferencePaneState): void {
    for (const entry of this.buttons) {
      const active = entry.source === state.source;
      entry.button.classList.toggle("is-active", active);
      entry.button.setAttribute("aria-pressed", String(active));
    }
    const description = state.referenceName
      ? state.pageCount
        ? `${state.referenceName} · ${state.pageCount} page${state.pageCount === 1 ? "" : "s"}`
        : state.referenceName
      : state.source === "same"
        ? "Same page"
        : "No reference loaded";
    this.name.textContent = description;
    this.name.title = description;
    this.hint.hidden = state.source !== "same";
    this.openButton.title =
      state.source === "drawing"
        ? "Open a PDF drawing as the reference"
        : state.source === "revision"
          ? "Open a .gridscalr revision as the reference"
          : "Open a revision project to compare";
  }
}
