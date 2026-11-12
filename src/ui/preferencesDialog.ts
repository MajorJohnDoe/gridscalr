import { loadAppPreferences, saveAppPreferences, type CsvFormat } from "../io/appPreferences";
import { clearRecent, getRecent, isTauri, pathExists, removeRecent } from "../io/platform";
import {
  currentLayerColorDefaults,
  resetLayerColorDefaults,
  saveLayerColorDefaults,
} from "../io/layerDefaults";
import {
  loadGlobalStampPresets,
  resetGlobalStampPresets,
  saveGlobalStampPresets,
} from "../io/stampDefaults";
import {
  languageOptions,
  languagePreference,
  setLanguagePreference,
  t,
  type LanguagePreference,
} from "../i18n";
import { store } from "../state/store";
import {
  clearAllRecovery,
  getRecoverySummary,
  openRecoveryCenter,
  refreshRecoverySummary,
} from "../features/sessionRecovery";
import { currentThemePreference, setThemePreference, THEME_OPTIONS } from "../theme/theme";
import type { ThemePreference } from "../io/appPreferences";
import { colorInputValue, setColorInput } from "./colorInput";
import { colorWithEyedropper } from "./colorPicker";
import { confirmDialog, showModal } from "./dialogs";
import { el } from "./dom";
import { loadPanelPreferences } from "./preferences";
import { resetPanelLayout, setInspectorCollapsed, setSidebarCollapsed } from "./sidebar";
import { categoryLayout, field, presetEditor, section } from "./settingsControls";
import { autosaveSection } from "./settings/autosave";
import { backupSection } from "./settings/backups";
import { toast } from "./toast";

function generalSection(): HTMLElement {
  const wrap = section(t("preferences.general"), t("language.note"));
  const select = el("select", "select");
  select.setAttribute("aria-label", t("language.label"));
  for (const option of languageOptions()) {
    const element = el("option", "", option.label);
    element.value = option.value;
    select.append(element);
  }
  select.value = languagePreference();
  select.addEventListener("change", () => {
    void setLanguagePreference(select.value as LanguagePreference).then(() => {
      openPreferencesDialog();
      toast(t("language.changed"), "success");
    });
  });

  const csvSelect = el("select", "select");
  csvSelect.setAttribute("aria-label", t("preferences.csv.format"));
  const csvOptions: Array<[CsvFormat, string]> = [
    ["locale", t("preferences.csv.locale")],
    ["interchange", t("preferences.csv.interchange")],
  ];
  for (const [value, label] of csvOptions) {
    const option = el("option", "", label);
    option.value = value;
    csvSelect.append(option);
  }
  csvSelect.value = loadAppPreferences().csvFormat;
  csvSelect.addEventListener("change", () => {
    saveAppPreferences({ csvFormat: csvSelect.value as CsvFormat });
  });

  const themeSelect = el("select", "select");
  themeSelect.setAttribute("aria-label", t("preferences.theme"));
  for (const option of THEME_OPTIONS) {
    const element = el("option", "", t(option.labelKey));
    element.value = option.value;
    themeSelect.append(element);
  }
  themeSelect.value = currentThemePreference();
  themeSelect.addEventListener("change", () => {
    setThemePreference(themeSelect.value as ThemePreference);
  });

  wrap.append(
    field(t("language.label"), select),
    field(t("preferences.theme"), themeSelect),
    el("p", "settings-note", t("preferences.theme.note")),
    field(t("preferences.csv.format"), csvSelect),
    el("p", "settings-note", t("preferences.csv.note")),
  );
  return wrap;
}

function workspaceSection(): HTMLElement {
  const wrap = section(t("preferences.workspace"), t("preferences.workspace.note"));
  const prefs = loadPanelPreferences();
  wrap.append(
    el(
      "p",
      "settings-note",
      t("preferences.workspace.summary", {
        left: prefs.leftWidth,
        right: prefs.rightWidth,
        leftNote: prefs.leftCollapsed ? t("preferences.workspace.collapsed") : "",
        rightNote: prefs.rightCollapsed ? t("preferences.workspace.collapsed") : "",
      }),
    ),
  );

  const actions = el("div", "settings-actions");
  const expand = el("button", "btn btn-small", t("preferences.workspace.expand"));
  expand.type = "button";
  expand.addEventListener("click", () => {
    setSidebarCollapsed(false);
    setInspectorCollapsed(false);
    openPreferencesDialog();
    toast(t("preferences.workspace.expanded"), "success");
  });
  const reset = el("button", "btn btn-small", t("preferences.workspace.reset"));
  reset.type = "button";
  reset.addEventListener("click", () => {
    resetPanelLayout();
    openPreferencesDialog();
    toast(t("preferences.workspace.resetDone"), "success");
  });
  actions.append(expand, reset);
  wrap.append(actions);
  return wrap;
}

function layersSection(): HTMLElement {
  const wrap = section(t("preferences.layers.title"), t("preferences.layers.note"));
  let colors = currentLayerColorDefaults();
  const row = el("div", "field-row");

  const colorField = (label: string, value: string) => {
    const fieldWrap = el("label", "field settings-field");
    const input = el("input", "color-swatch");
    input.type = "color";
    setColorInput(input, value, "#f2a93b");
    input.setAttribute("aria-label", label);
    fieldWrap.append(el("span", "field-label", label), colorWithEyedropper(input, label));
    return { fieldWrap, input };
  };

  const measure = colorField(t("preferences.layers.measure"), colors.measure);
  const draw = colorField(t("preferences.layers.draw"), colors.draw);
  row.append(measure.fieldWrap, draw.fieldWrap);

  const save = () => {
    colors = saveLayerColorDefaults({
      measure: colorInputValue(measure.input, colors.measure),
      draw: colorInputValue(draw.input, colors.draw),
    });
  };
  measure.input.addEventListener("change", save);
  draw.input.addEventListener("change", save);

  const actions = el("div", "settings-actions");
  const signalRed = el("button", "btn btn-small", t("preferences.layers.signalRed"));
  signalRed.type = "button";
  signalRed.addEventListener("click", () => {
    setColorInput(measure.input, "#f70808", "#f70808");
    setColorInput(draw.input, "#f70808", "#f70808");
    save();
    toast(t("preferences.layers.signalRedDone"), "success");
  });
  const reset = el("button", "btn btn-small", t("preferences.layers.reset"));
  reset.type = "button";
  reset.addEventListener("click", () => {
    colors = resetLayerColorDefaults();
    setColorInput(measure.input, colors.measure, colors.measure);
    setColorInput(draw.input, colors.draw, colors.draw);
    toast(t("preferences.layers.resetDone"), "success");
  });
  actions.append(signalRed, reset);
  wrap.append(row, actions);
  return wrap;
}

function stampsSection(): HTMLElement {
  const wrap = section(t("preferences.stamps.title"), t("preferences.stamps.note"));

  const editor = presetEditor(
    loadGlobalStampPresets(),
    (next) => {
      saveGlobalStampPresets(next);
    },
    t("preferences.stamps.add"),
  );

  const actions = el("div", "settings-actions");
  const fromProject = el("button", "btn btn-small", t("preferences.stamps.fromProject"));
  fromProject.type = "button";
  fromProject.disabled = !store.project;
  fromProject.title = store.project
    ? t("preferences.stamps.fromProjectTitle")
    : t("preferences.stamps.fromProjectDisabled");
  fromProject.addEventListener("click", () => {
    const project = store.project;
    if (!project) return;
    saveGlobalStampPresets(project.settings.stampPresets);
    openPreferencesDialog();
    toast(t("preferences.stamps.updated"), "success");
  });
  const reset = el("button", "btn btn-small", t("preferences.stamps.reset"));
  reset.type = "button";
  reset.addEventListener("click", () => {
    resetGlobalStampPresets();
    openPreferencesDialog();
    toast(t("preferences.stamps.resetDone"), "success");
  });
  actions.append(fromProject, reset);
  wrap.append(editor, actions);
  return wrap;
}

function recoveryCard(): HTMLElement {
  const wrap = section(t("preferences.data.recoveryTitle"));
  const summary = getRecoverySummary();
  const hasRecovery = summary.count + summary.checkpoints > 0;
  if (hasRecovery) {
    const status = el("div", "settings-status");
    if (summary.count) {
      status.append(
        el("span", "settings-badge", t("preferences.data.unsavedCount", { count: summary.count })),
      );
    }
    if (summary.checkpoints) {
      status.append(
        el(
          "span",
          "settings-badge",
          t("preferences.data.checkpointCount", { count: summary.checkpoints }),
        ),
      );
    }
    wrap.append(status);
    if (summary.latest) {
      wrap.append(
        el(
          "p",
          "settings-note",
          t("preferences.data.latest", {
            name: summary.latest.projectName,
            time: new Date(summary.latest.savedAt).toLocaleString(),
          }),
        ),
      );
    }
  } else {
    wrap.append(el("p", "settings-note", t("preferences.data.recoveryNone")));
  }

  const reviewRecovery = el("button", "btn btn-small", t("preferences.data.reviewRecovery"));
  reviewRecovery.type = "button";
  reviewRecovery.addEventListener("click", () => {
    void (async () => {
      await openRecoveryCenter();
      openPreferencesDialog();
    })();
  });
  const clearRecovery = el(
    "button",
    "btn btn-small btn-danger",
    t("preferences.data.clearRecovery"),
  );
  clearRecovery.type = "button";
  clearRecovery.disabled = !hasRecovery;
  clearRecovery.addEventListener("click", () => {
    void (async () => {
      const confirmed = await confirmDialog(
        t("preferences.data.clearRecoveryTitle"),
        t("preferences.data.clearRecoveryNote"),
        t("preferences.data.clearRecovery"),
        { danger: true },
      );
      if (!confirmed) return;
      await clearAllRecovery();
      await refreshRecoverySummary();
      openPreferencesDialog();
      toast(t("preferences.data.recoveryCleared"), "success");
    })();
  });
  const actions = el("div", "settings-actions");
  actions.append(reviewRecovery, clearRecovery);
  wrap.append(actions);
  return wrap;
}

function recentCard(): HTMLElement {
  const wrap = section(t("preferences.data.recentTitle"));
  const recent = getRecent();
  if (!recent.length) {
    wrap.append(el("p", "settings-note", t("preferences.data.recentEmpty")));
  } else {
    const list = el("div", "settings-list");
    for (const entry of recent) {
      const row = el("div", "settings-list-row");
      const name = el("span", "settings-list-name", entry.name);
      name.title = entry.name;
      const missing = el("span", "settings-badge is-warning", "");
      const kind = el(
        "span",
        "settings-list-kind",
        entry.kind === "pdf"
          ? t("preferences.data.kindDrawing")
          : t("preferences.data.kindProject"),
      );
      const remove = el("button", "btn btn-small", t("preferences.data.remove"));
      remove.type = "button";
      remove.addEventListener("click", () => {
        removeRecent(entry.path, entry.kind);
        openPreferencesDialog();
      });
      row.append(name, missing, kind, remove);
      list.append(row);
      if (isTauri) {
        void pathExists(entry.path).then((exists) => {
          if (!exists && missing.isConnected) missing.textContent = t("preferences.data.missing");
        });
      }
    }
    wrap.append(list);
  }
  const clearRecents = el("button", "btn btn-small", t("preferences.data.clearRecent"));
  clearRecents.type = "button";
  clearRecents.disabled = recent.length === 0;
  clearRecents.addEventListener("click", () => {
    void (async () => {
      const confirmed = await confirmDialog(
        t("preferences.data.clearRecentTitle"),
        t("preferences.data.clearRecentNote"),
        t("preferences.data.clearRecent"),
        { danger: true },
      );
      if (!confirmed) return;
      clearRecent();
      openPreferencesDialog();
      toast(t("preferences.data.recentCleared"), "success");
    })();
  });
  const actions = el("div", "settings-actions");
  actions.append(clearRecents);
  wrap.append(actions);
  return wrap;
}

function dataSection(): HTMLElement[] {
  const intro = el("div", "settings-intro");
  intro.append(
    el("h3", "", t("preferences.data.title")),
    el("p", "settings-note", t("preferences.data.note")),
  );
  return [intro, autosaveSection(), backupSection(), recoveryCard(), recentCard()];
}

export function openPreferencesDialog(): void {
  void (async () => {
    await refreshRecoverySummary();
    const layout = categoryLayout(t("preferences.categories"), [
      { id: "general", label: t("preferences.general"), render: generalSection },
      { id: "workspace", label: t("preferences.workspace"), render: workspaceSection },
      { id: "layers", label: t("preferences.layers"), render: layersSection },
      { id: "stamps", label: t("preferences.stamps"), render: stampsSection },
      { id: "data", label: t("preferences.data"), render: dataSection },
    ]);

    void showModal({
      title: t("preferences.title"),
      subtitle: t("preferences.subtitle"),
      body: layout.body,
      wide: true,
      className: "modal-preferences",
      actions: [{ label: t("common.close"), value: "close", primary: true }],
    });
  })();
}
