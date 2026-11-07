import { t } from "../../i18n";
import { makeId } from "../../model/calibration";
import {
  MARKUPS_COLUMN_IDS,
  defaultMarkupsViewSettings,
  markupsColumnLabel,
  markupsSettingsEqual,
  normalizeMarkupsColumns,
  settingsForView,
  uniqueMarkupsViewName,
  viewFromSettings,
} from "../../model/markups";
import type { MarkupsColumnId, MarkupsView, Project } from "../../model/types";
import { store } from "../../state/store";
import { showModal, textDialog } from "../dialogs";
import { el } from "../dom";
import type { PanelActions } from "../panels";
import { loadActiveViewId, markupsState, saveActiveViewId } from "./state";

export function syncProject(project: Project): void {
  if (project.id !== markupsState.currentProjectId) {
    markupsState.currentProjectId = project.id;
    markupsState.collapsedGroups.clear();
    const stored = loadActiveViewId(project.id);
    const view = stored ? project.markupsViews.find((entry) => entry.id === stored) : undefined;
    if (view) {
      markupsState.activeViewId = view.id;
      markupsState.settings = settingsForView(view);
    } else {
      markupsState.activeViewId = null;
      markupsState.settings = defaultMarkupsViewSettings();
    }
    markupsState.viewDirty = false;
    return;
  }

  const activeView = markupsState.activeViewId
    ? project.markupsViews.find((entry) => entry.id === markupsState.activeViewId)
    : undefined;
  if (markupsState.activeViewId && !activeView) {
    markupsState.activeViewId = null;
    markupsState.settings = defaultMarkupsViewSettings();
    markupsState.viewDirty = false;
    saveActiveViewId(project.id, null);
    return;
  }
  if (activeView && !markupsState.viewDirty) {
    const storedSettings = settingsForView(activeView);
    if (!markupsSettingsEqual(markupsState.settings, storedSettings))
      markupsState.settings = storedSettings;
  }
  if (
    markupsState.settings.categoryId &&
    !project.categories.some((entry) => entry.id === markupsState.settings.categoryId)
  ) {
    markupsState.settings.categoryId = null;
  }
  if (
    markupsState.settings.countType &&
    !project.countTypes.some((entry) => entry.id === markupsState.settings.countType)
  ) {
    markupsState.settings.countType = null;
  }
}

export function markViewDirty(): void {
  markupsState.viewDirty = true;
  updateViewControls();
}

export function updateViewControls(): void {
  if (markupsState.viewDirtyEl)
    markupsState.viewDirtyEl.hidden = !(markupsState.viewDirty && markupsState.activeViewId);
  if (markupsState.saveViewBtn) {
    markupsState.saveViewBtn.disabled =
      Boolean(markupsState.activeViewId) && !markupsState.viewDirty;
    markupsState.saveViewBtn.title = markupsState.activeViewId
      ? t("markups.saveCurrent")
      : t("markups.saveAsView");
  }
}

export function applyView(viewId: string | null, actions: PanelActions): void {
  const project = store.project;
  const view = viewId ? project?.markupsViews.find((entry) => entry.id === viewId) : undefined;
  markupsState.activeViewId = view?.id ?? null;
  markupsState.settings = view ? settingsForView(view) : defaultMarkupsViewSettings();
  markupsState.viewDirty = false;
  markupsState.collapsedGroups.clear();
  saveActiveViewId(project?.id ?? null, markupsState.activeViewId);
  actions.refresh();
}

export async function saveViewAs(actions: PanelActions): Promise<void> {
  const project = store.project;
  if (!project) return;
  const suggested = uniqueMarkupsViewName(
    project.markupsViews,
    t("markups.defaultViewName", { number: project.markupsViews.length + 1 }),
  );
  const requested = await textDialog(
    t("markups.saveViewTitle"),
    t("markups.saveViewNote"),
    suggested,
    t("markups.viewName"),
  );
  if (!requested) return;
  const latest = store.project;
  if (!latest) return;
  const name = uniqueMarkupsViewName(latest.markupsViews, requested);
  const view = viewFromSettings(makeId("view"), name, markupsState.settings);
  markupsState.activeViewId = view.id;
  markupsState.viewDirty = false;
  saveActiveViewId(latest.id, view.id);
  store.mutate((current) => {
    current.markupsViews.push(view);
  }, "change");
  actions.refresh();
}

export function saveCurrentView(actions: PanelActions): void {
  const project = store.project;
  if (!project) return;
  if (!markupsState.activeViewId) {
    void saveViewAs(actions);
    return;
  }
  const existing = project.markupsViews.find((view) => view.id === markupsState.activeViewId);
  if (!existing) {
    markupsState.activeViewId = null;
    void saveViewAs(actions);
    return;
  }
  const next = viewFromSettings(existing.id, existing.name, markupsState.settings);
  markupsState.viewDirty = false;
  updateViewControls();
  store.mutate((current) => {
    const index = current.markupsViews.findIndex((view) => view.id === existing.id);
    if (index >= 0) current.markupsViews[index] = next;
    else current.markupsViews.push(next);
  }, "change");
  actions.refresh();
}

export function openColumnsDialog(actions: PanelActions): void {
  const body = el("div", "markups-columns-dialog");
  const checks = new Map<MarkupsColumnId, HTMLInputElement>();
  for (const id of MARKUPS_COLUMN_IDS) {
    const label = el("label", "markups-column-option");
    const check = el("input");
    check.type = "checkbox";
    check.checked = markupsState.settings.columns.includes(id);
    check.disabled = id === "name";
    if (id === "name") check.checked = true;
    checks.set(id, check);
    label.append(check, el("span", "", markupsColumnLabel(id)));
    body.append(label);
  }
  body.append(el("p", "modal-hint", t("markups.columnsNote")));
  void showModal({
    title: t("markups.columnsTitle"),
    subtitle: t("markups.columnsIntro"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.apply"), value: "apply", primary: true },
    ],
  }).then((value) => {
    if (value !== "apply") return;
    markupsState.settings.columns = normalizeMarkupsColumns(
      MARKUPS_COLUMN_IDS.filter((id) => checks.get(id)?.checked),
    );
    markupsState.collapsedGroups.clear();
    markViewDirty();
    actions.refresh();
  });
}

export function openManageViews(project: Project, actions: PanelActions): void {
  const body = el("div", "markups-view-manager");
  if (!project.markupsViews.length) {
    body.append(el("p", "modal-message", t("markups.noViews")));
  }
  const rows: Array<{
    view: MarkupsView;
    name: HTMLInputElement;
    remove: HTMLInputElement;
    row: HTMLElement;
  }> = [];
  for (const view of project.markupsViews) {
    const row = el("div", "markups-view-row");
    const name = el("input", "input");
    name.type = "text";
    name.maxLength = 60;
    name.value = view.name;
    name.setAttribute("aria-label", t("markups.viewNameAria", { name: view.name }));
    const removeLabel = el("label", "markups-view-remove");
    const remove = el("input");
    remove.type = "checkbox";
    removeLabel.append(remove, el("span", "", t("common.remove")));
    remove.addEventListener("change", () => {
      name.disabled = remove.checked;
      row.classList.toggle("is-removed", remove.checked);
    });
    row.append(name, removeLabel);
    body.append(row);
    rows.push({ view, name, remove, row });
  }
  body.append(el("p", "modal-hint", t("markups.viewsNote")));
  void showModal({
    title: t("markups.viewsTitle"),
    subtitle: t("markups.viewsIntro"),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.apply"), value: "apply", primary: true },
    ],
    onValidate: () => {
      const kept = rows.filter((entry) => !entry.remove.checked);
      const names = kept.map((entry) => entry.name.value.replace(/\s+/g, " ").trim().slice(0, 60));
      if (names.some((name) => !name)) return t("markups.viewNameRequired");
      const keys = names.map((name) => name.toLocaleLowerCase());
      if (new Set(keys).size !== keys.length) return t("markups.viewNameUnique");
      return null;
    },
  }).then((value) => {
    if (value !== "apply") return;
    const kept = rows.filter((entry) => !entry.remove.checked);
    const activeRemoved = Boolean(
      markupsState.activeViewId &&
      kept.every((entry) => entry.view.id !== markupsState.activeViewId),
    );
    if (activeRemoved) {
      markupsState.activeViewId = null;
      markupsState.settings = defaultMarkupsViewSettings();
      markupsState.viewDirty = false;
      markupsState.collapsedGroups.clear();
      saveActiveViewId(project.id, null);
    }
    const names = new Map(
      kept.map((entry) => [
        entry.view.id,
        entry.name.value.replace(/\s+/g, " ").trim().slice(0, 60),
      ]),
    );
    store.mutate((current) => {
      current.markupsViews = kept.map((entry) => {
        const source = current.markupsViews.find((view) => view.id === entry.view.id) ?? entry.view;
        return { ...source, name: names.get(entry.view.id) ?? source.name };
      });
    }, "change");
    actions.refresh();
  });
}
