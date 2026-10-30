import type { DiffItem, DiffStatus, RevisionDiff } from "../compare/revisionDiff";
import { el } from "./dom";
import { icon } from "./icons";
import type { ComparisonMode } from "./splitView";

export interface CompareReferenceInfo {
  pageCount?: number;
}

export interface ComparePanelActions {
  setMode: (mode: ComparisonMode) => void;
  setOpacity: (value: number) => void;
  selectItem: (item: DiffItem) => void;
  refresh: () => void;
  exportPdf: () => void;
  close: () => void;
}

type CompareFilter = "changes" | "all" | DiffStatus;

function statusLabel(status: DiffStatus): string {
  if (status === "added") return "Added";
  if (status === "removed") return "Removed";
  if (status === "changed") return "Changed";
  return "Unchanged";
}

function itemKey(item: DiffItem): string {
  return `${item.status}:${item.page}:${item.current?.item.id ?? item.reference?.item.id ?? ""}`;
}

const FILTERS: Array<{ value: CompareFilter; label: string }> = [
  { value: "changes", label: "Changes only" },
  { value: "all", label: "All items" },
  { value: "changed", label: "Changed" },
  { value: "added", label: "Added" },
  { value: "removed", label: "Removed" },
  { value: "unchanged", label: "Unchanged" },
];

/**
 * Floating comparison list. The canvas stays visible and interactive behind
 * it; the panel only owns the diff list and comparison controls.
 */
export class ComparePanel {
  readonly element: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly warnings: HTMLElement;
  private readonly list: HTMLElement;
  private readonly opacityControl: HTMLElement;
  private readonly opacityInput: HTMLInputElement;
  private readonly modeButtons: HTMLButtonElement[];
  private readonly filterSelect: HTMLSelectElement;
  private readonly filterField: HTMLElement;
  private readonly title: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly restore: HTMLButtonElement;
  private filter: CompareFilter = "changes";
  private mode: ComparisonMode = "side";
  private opacity = 0.5;
  private selected: string | null = null;
  private diff: RevisionDiff | null = null;
  private info: CompareReferenceInfo = {};
  private collapsed = false;

  constructor(
    host: HTMLElement,
    private readonly actions: ComparePanelActions,
  ) {
    this.element = el("section", "compare-panel");
    this.element.setAttribute("aria-label", "Revision comparison");

    const header = el("header", "compare-header");
    const heading = el("div", "compare-heading");
    const kicker = el("span", "compare-kicker", "Compare revisions");
    this.kicker = kicker;
    this.title = el("strong", "compare-title", "Loading comparison…");
    heading.append(kicker, this.title);
    const collapseButton = el("button", "icon-btn compare-collapse");
    collapseButton.type = "button";
    collapseButton.title = "Hide comparison panel";
    collapseButton.setAttribute("aria-label", "Hide comparison panel");
    collapseButton.innerHTML = icon("chevronRight", 15);
    collapseButton.addEventListener("click", () => this.setCollapsed(true));
    const closeButton = el("button", "icon-btn compare-close");
    closeButton.type = "button";
    closeButton.title = "Close comparison";
    closeButton.setAttribute("aria-label", "Close comparison");
    closeButton.innerHTML = icon("close", 15);
    closeButton.addEventListener("click", () => this.actions.close());
    header.append(heading, collapseButton, closeButton);

    this.summary = el("div", "compare-summary");
    this.warnings = el("div", "compare-warnings");
    this.warnings.hidden = true;

    const controls = el("div", "compare-controls");
    const modeGroup = el("div", "compare-modes");
    modeGroup.setAttribute("role", "group");
    modeGroup.setAttribute("aria-label", "Comparison layout");
    this.modeButtons = (["side", "overlay"] as ComparisonMode[]).map((mode) => {
      const button = el("button", "compare-mode", mode === "side" ? "Side by side" : "Overlay");
      button.type = "button";
      button.dataset.mode = mode;
      button.addEventListener("click", () => {
        this.mode = mode;
        this.updateModeButtons();
        this.actions.setMode(mode);
      });
      modeGroup.append(button);
      return button;
    });

    this.opacityControl = el("label", "compare-opacity");
    this.opacityControl.append(el("span", "", "Opacity"));
    this.opacityInput = el("input", "compare-opacity-input") as HTMLInputElement;
    this.opacityInput.type = "range";
    this.opacityInput.min = "10";
    this.opacityInput.max = "90";
    this.opacityInput.step = "5";
    this.opacityInput.value = "50";
    this.opacityInput.addEventListener("input", () => {
      this.opacity = Number(this.opacityInput.value) / 100;
      this.actions.setOpacity(this.opacity);
    });
    this.opacityControl.append(this.opacityInput);

    const filterLabel = el("label", "compare-filter");
    filterLabel.append(el("span", "", "Show"));
    this.filterSelect = el("select", "compare-filter-select") as HTMLSelectElement;
    this.filterSelect.setAttribute("aria-label", "Filter revision differences");
    for (const entry of FILTERS) {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      this.filterSelect.append(option);
    }
    this.filterSelect.value = this.filter;
    this.filterSelect.addEventListener("change", () => {
      this.filter = this.filterSelect.value as CompareFilter;
      this.renderList();
    });
    filterLabel.append(this.filterSelect);
    this.filterField = filterLabel;
    controls.append(modeGroup, this.opacityControl, filterLabel);

    this.list = el("div", "compare-list");

    const footer = el("footer", "compare-footer");
    const refresh = el("button", "btn btn-small", "Refresh");
    refresh.type = "button";
    refresh.addEventListener("click", () => this.actions.refresh());
    const exportButton = el("button", "btn btn-small", "Export PDF");
    exportButton.type = "button";
    exportButton.innerHTML = `${icon("download", 13)}<span>Export PDF</span>`;
    exportButton.addEventListener("click", () => this.actions.exportPdf());
    footer.append(refresh, exportButton);

    this.element.append(header, this.summary, this.warnings, controls, this.list, footer);
    host.append(this.element);
    this.restore = el("button", "compare-restore");
    this.restore.type = "button";
    this.restore.title = "Show comparison panel";
    this.restore.setAttribute("aria-label", "Show comparison panel");
    this.restore.innerHTML = icon("compare", 16);
    this.restore.hidden = true;
    this.restore.addEventListener("click", () => this.setCollapsed(false));
    host.append(this.restore);
    this.updateModeButtons();
    this.updateOpacityControl();
  }

  update(
    currentName: string,
    referenceName: string,
    diff: RevisionDiff | null,
    info: CompareReferenceInfo = {},
  ): void {
    this.diff = diff;
    this.info = info;
    this.kicker.textContent = diff ? "Compare revisions" : "Compare drawing";
    this.title.textContent = `${currentName} → ${referenceName}`;
    this.title.title = this.title.textContent;
    this.filterField.hidden = !diff;
    this.renderSummary();
    this.renderWarnings();
    this.renderList();
  }

  destroy(): void {
    this.element.remove();
    this.restore.remove();
  }

  private setCollapsed(collapsed: boolean): void {
    if (collapsed === this.collapsed) return;
    this.collapsed = collapsed;
    this.element.hidden = collapsed;
    this.restore.hidden = !collapsed;
  }

  private renderSummary(): void {
    this.summary.textContent = "";
    if (!this.diff) {
      const pages = this.info.pageCount;
      this.summary.append(
        el(
          "div",
          "compare-note",
          pages
            ? `Drawing reference · ${pages} page${pages === 1 ? "" : "s"} · no markup comparison`
            : "Drawing reference · no markup comparison",
        ),
      );
      return;
    }
    const entries: Array<{ key: DiffStatus; label: string }> = [
      { key: "changed", label: "Changed" },
      { key: "added", label: "Added" },
      { key: "removed", label: "Removed" },
      { key: "unchanged", label: "Unchanged" },
    ];
    for (const entry of entries) {
      const pill = el("span", `compare-pill status-${entry.key}`);
      pill.append(el("strong", "", String(this.diff.summary[entry.key])));
      pill.append(el("span", "", entry.label));
      this.summary.append(pill);
    }
  }

  private renderWarnings(): void {
    this.warnings.textContent = "";
    const warnings = this.diff?.warnings ?? [];
    this.warnings.hidden = warnings.length === 0;
    for (const warning of warnings) {
      const row = el("div", "compare-warning");
      row.innerHTML = icon("warning", 13);
      row.append(el("span", "", warning));
      this.warnings.append(row);
    }
  }

  private renderList(): void {
    this.list.textContent = "";
    if (!this.diff) {
      this.list.append(el("div", "compare-empty", "No markup comparison for a drawing reference."));
      return;
    }
    const items = (this.diff?.items ?? []).filter((item) => {
      if (this.filter === "all") return true;
      if (this.filter === "changes") return item.status !== "unchanged";
      return item.status === this.filter;
    });
    if (!items.length) {
      this.list.append(
        el(
          "div",
          "compare-empty",
          this.filter === "changes"
            ? "No changed, added or removed items between these revisions."
            : "No items match this filter.",
        ),
      );
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = el("button", `compare-row status-${item.status}`);
      row.type = "button";
      row.dataset.status = item.status;
      row.dataset.page = String(item.page);
      if (this.selected === itemKey(item)) row.classList.add("is-selected");
      const top = el("span", "compare-row-top");
      top.append(el("span", "compare-status", statusLabel(item.status)));
      top.append(el("span", "compare-row-label", item.label));
      const meta = el(
        "span",
        "compare-row-meta",
        `Page ${item.page} · ${item.kindLabel} · ${item.layerName}`,
      );
      const detail =
        item.status === "changed"
          ? item.changes.map((change) => change.label).join(", ")
          : item.status === "unchanged"
            ? ""
            : item.status === "added"
              ? "Only in the current revision"
              : "Only in the reference revision";
      row.append(top, meta);
      if (detail) row.append(el("span", "compare-row-detail", detail));
      row.addEventListener("click", () => {
        this.selected = itemKey(item);
        this.renderList();
        this.actions.selectItem(item);
      });
      fragment.append(row);
    }
    this.list.append(fragment);
  }

  private updateModeButtons(): void {
    for (const button of this.modeButtons) {
      const active = button.dataset.mode === this.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    this.updateOpacityControl();
  }

  private updateOpacityControl(): void {
    this.opacityControl.hidden = this.mode !== "overlay";
    this.opacityInput.value = String(Math.round(this.opacity * 100));
  }
}
