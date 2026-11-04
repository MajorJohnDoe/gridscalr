import { el } from "./dom";
import { icon } from "./icons";
import { t } from "../i18n";

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

function sourceLabel(source: ReferenceSource): string {
  if (source === "revision") return t("reference.revision");
  if (source === "drawing") return t("reference.drawing");
  return t("reference.samePage");
}

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
  private readonly observer: ResizeObserver;

  constructor(
    host: HTMLElement,
    private readonly actions: ReferencePaneActions,
  ) {
    this.element = el("div", "reference-bar");
    this.element.setAttribute("role", "toolbar");
    this.element.setAttribute("aria-label", t("reference.paneAria"));

    const top = el("div", "reference-bar-row");
    top.append(el("span", "reference-bar-label", t("reference.label")));

    const sources = el("div", "reference-sources");
    sources.setAttribute("role", "group");
    sources.setAttribute("aria-label", t("reference.source"));
    for (const source of ["same", "revision", "drawing"] as ReferenceSource[]) {
      const button = el("button", "reference-source", sourceLabel(source));
      button.type = "button";
      button.dataset.source = source;
      button.addEventListener("click", () => this.actions.setSource(source));
      sources.append(button);
      this.buttons.push({ source, button });
    }

    this.name = el("span", "reference-name", t("reference.samePage"));
    this.name.title = t("reference.samePage");

    this.openButton = el("button", "btn btn-small reference-open");
    this.openButton.type = "button";
    this.openButton.title = t("reference.openTitle");
    this.openButton.innerHTML = `${icon("folder", 13)}<span>${t("reference.open")}</span>`;
    this.openButton.addEventListener("click", () => this.actions.open());

    const closeButton = el("button", "icon-btn reference-close");
    closeButton.type = "button";
    closeButton.title = t("reference.closeTitle");
    closeButton.setAttribute("aria-label", t("reference.closeTitle"));
    closeButton.innerHTML = icon("close", 14);
    closeButton.addEventListener("click", () => this.actions.close());

    top.append(sources, this.name, this.openButton, closeButton);
    this.hint = el("div", "reference-hint", t("reference.hint"));
    this.element.append(top, this.hint);
    host.prepend(this.element);
    this.observer = new ResizeObserver(() => this.syncHeight());
    this.observer.observe(this.element);
    this.syncHeight();
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
        ? t("reference.samePage")
        : t("reference.noReference");
    this.name.textContent = description;
    this.name.title = description;
    this.hint.hidden = state.source !== "same";
    this.openButton.title =
      state.source === "drawing"
        ? t("reference.openDrawingTitle")
        : state.source === "revision"
          ? t("reference.openRevisionTitle")
          : t("reference.openRevisionProjectTitle");
    requestAnimationFrame(() => this.syncHeight());
  }

  private syncHeight(): void {
    const container =
      this.element.closest<HTMLElement>(".canvas-area") ?? this.element.parentElement;
    if (!container) return;
    container.style.setProperty("--reference-bar-height", `${this.element.offsetHeight}px`);
  }
}
