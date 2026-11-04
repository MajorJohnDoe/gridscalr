import {
  isManualCalibration,
  pageCalibration,
  pageScale,
  pageScaleLocked,
} from "../model/calibration";
import type { AreaUnit, LengthUnit } from "../model/types";
import { clampLabelSize, LABEL_MAX_SIZE, LABEL_MIN_SIZE } from "../model/label";
import {
  AREA_UNITS,
  formatNumber,
  formatScale,
  LENGTH_UNITS,
  lengthUnitLabel,
} from "../model/units";
import { ingestImageBlob } from "../io/imageIngest";
import { pickImage } from "../io/platform";
import { loadGlobalStampPresets } from "../io/stampDefaults";
import { normalizeProjectName, PROJECT_NAME_MAX_LENGTH } from "../model/projectName";
import { openCountTypesDialog } from "../features/countTypes/ui";
import { store } from "../state/store";
import { openCategoriesDialog } from "./categoriesDialog";
import { showModal } from "./dialogs";
import { el, option } from "./dom";
import { checkRow, field, presetEditor, section } from "./settingsControls";
import { toast } from "./toast";
import { t } from "../i18n";

function projectSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.projectTitle"), t("settings.projectNote"));
  const input = el("input", "input");
  input.type = "text";
  input.value = project.name;
  input.maxLength = PROJECT_NAME_MAX_LENGTH;
  input.setAttribute("aria-label", t("settings.projectName"));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener("change", () => {
    const current = store.project;
    if (!current) return;
    const name = normalizeProjectName(input.value, current.name);
    input.value = name;
    if (name === current.name) return;
    store.mutate((next) => {
      next.name = name;
    }, "change");
  });
  wrap.append(
    field(t("settings.projectName"), input),
    el("p", "settings-note", t("settings.fileNameNote")),
  );
  return wrap;
}

function metadataSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.metadataTitle"), t("settings.metadataNote"));
  const fields: Array<[keyof typeof project.metadata, string]> = [
    ["reportTitle", t("report.meta.reportTitle")],
    ["facility", t("report.meta.property")],
    ["client", t("report.meta.client")],
    ["projectNumber", t("report.meta.projectNumber")],
    ["revision", t("report.meta.revision")],
    ["preparedBy", t("report.meta.preparedBy")],
    ["reportDate", t("report.meta.date")],
  ];
  for (const [key, label] of fields) {
    const input = el("input", "input");
    input.type = "text";
    input.value = project.metadata[key];
    input.maxLength = key === "notes" ? 2000 : 120;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
      store.mutate((next) => {
        next.metadata[key] = input.value.trim();
      }, "change");
    });
    wrap.append(field(label, input));
  }
  const notes = el("textarea", "input textarea");
  notes.value = project.metadata.notes;
  notes.setAttribute("aria-label", t("report.meta.notes"));
  notes.addEventListener("change", () => {
    store.mutate((next) => {
      next.metadata.notes = notes.value.trim();
    }, "change");
  });
  wrap.append(field(t("report.meta.notes"), notes));

  const logoRow = el("div", "field-row");
  const currentLogo = project.reportLogoAssetId
    ? project.assets[project.reportLogoAssetId]
    : undefined;
  if (currentLogo) {
    const preview = el("img", "settings-logo-preview") as HTMLImageElement;
    preview.src = currentLogo.data;
    preview.alt = t("settings.reportLogo");
    logoRow.append(preview);
  }
  const logoActions = el("div", "settings-actions");
  const chooseLogo = el("button", "btn btn-small", t("settings.chooseLogo"));
  chooseLogo.type = "button";
  chooseLogo.addEventListener("click", () => {
    void (async () => {
      const file = await pickImage();
      if (!file) return;
      try {
        const asset = await ingestImageBlob(file, file.name);
        store.mutate((next) => {
          const previous = next.reportLogoAssetId;
          next.assets[asset.id] = asset;
          next.reportLogoAssetId = asset.id;
          if (previous && previous !== asset.id) {
            const used = next.layers.some((layer) =>
              layer.items.some((item) => item.image?.assetId === previous),
            );
            if (!used) delete next.assets[previous];
          }
        }, "change");
        openSettingsDialog();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "warning");
      }
    })();
  });
  logoActions.append(chooseLogo);
  if (currentLogo) {
    const removeLogo = el("button", "btn btn-small btn-ghost", t("settings.removeLogo"));
    removeLogo.type = "button";
    removeLogo.addEventListener("click", () => {
      store.mutate((next) => {
        const previous = next.reportLogoAssetId;
        next.reportLogoAssetId = null;
        if (previous) {
          const used = next.layers.some((layer) =>
            layer.items.some((item) => item.image?.assetId === previous),
          );
          if (!used) delete next.assets[previous];
        }
      }, "change");
      openSettingsDialog();
    });
    logoActions.append(removeLogo);
  }
  logoRow.append(logoActions);
  wrap.append(el("p", "settings-note", t("settings.logoNote")), logoRow);
  return wrap;
}

function scaleSection(): HTMLElement {
  const project = store.project!;
  const page = store.ui.page;
  const calibration = pageCalibration(project, page);
  const locked = pageScaleLocked(project, page);
  const wrap = section(t("settings.scaleTitle"), t("settings.scaleNote"));
  const value = el("p", "settings-scale-value");
  if (!calibration) {
    value.textContent = t("settings.scaleNone", { page });
  } else {
    const detail = isManualCalibration(calibration)
      ? t("settings.scaleManual", { ratio: formatNumber(calibration.ratio, 6) })
      : t("settings.scaleReference", {
          length: formatNumber(calibration.knownLength, 2),
          unit: calibration.unit,
        });
    value.textContent = t("settings.scaleValue", {
      page,
      detail,
      scale: formatScale(pageScale(project, page), calibration),
      locked: locked ? t("settings.scaleLockedSuffix") : "",
    });
  }
  const hint = el("p", "settings-note", t("settings.scaleHint"));
  wrap.append(value, hint);
  return wrap;
}

function unitsSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.unitsTitle"), t("settings.unitsNote"));
  const row = el("div", "field-row");

  const length = el("select", "select");
  length.setAttribute("aria-label", t("settings.lengthUnitAria"));
  for (const unit of LENGTH_UNITS) {
    length.append(
      option(unit.id, lengthUnitLabel(unit.id), unit.id === project.settings.lengthUnit),
    );
  }
  length.addEventListener("change", () => {
    store.mutate((project) => {
      project.settings.lengthUnit = length.value as LengthUnit;
    }, "change");
  });

  const area = el("select", "select");
  area.setAttribute("aria-label", t("settings.areaUnitAria"));
  for (const unit of AREA_UNITS) {
    area.append(option(unit.id, unit.label, unit.id === project.settings.areaUnit));
  }
  area.addEventListener("change", () => {
    store.mutate((project) => {
      project.settings.areaUnit = area.value as AreaUnit;
    }, "change");
  });

  row.append(field(t("settings.length"), length), field(t("settings.area"), area));
  wrap.append(row);
  wrap.append(
    checkRow(t("settings.smartLength"), project.settings.smartLengthUnits, (checked) => {
      store.mutate((project) => {
        project.settings.smartLengthUnits = checked;
      }, "change");
    }),
  );
  wrap.append(el("p", "settings-note", t("settings.smartLengthNote")));
  return wrap;
}

function labelsSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.labelsTitle"), t("settings.labelsNote"));

  const sizeField = field(t("settings.labelSize"), el("div", "settings-range"));
  const range = sizeField.querySelector<HTMLElement>(".settings-range")!;
  const input = el("input", "input");
  input.type = "range";
  input.min = String(LABEL_MIN_SIZE);
  input.max = String(LABEL_MAX_SIZE);
  input.step = "0.5";
  const current = clampLabelSize(project.settings.labelSize);
  input.value = String(current);
  input.setAttribute("aria-label", t("settings.labelSizeAria"));
  input.title = t("settings.labelSizeTitle");
  const readout = el("span", "settings-range-value", `${formatNumber(current, 1)} pt`);
  input.addEventListener("input", () => {
    readout.textContent = `${formatNumber(Number(input.value), 1)} pt`;
  });
  input.addEventListener("change", () => {
    const value = clampLabelSize(Number(input.value));
    store.mutate((project) => {
      project.settings.labelSize = value;
    }, "change");
  });
  range.append(input, readout);
  wrap.append(
    sizeField,
    checkRow(t("settings.compactArea"), project.settings.compactAreaLabels, (checked) => {
      store.mutate((project) => {
        project.settings.compactAreaLabels = checked;
      }, "change");
    }),
  );
  wrap.append(el("p", "settings-note", t("settings.compactAreaNote")));
  return wrap;
}

function displaySection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.displayTitle"));
  wrap.append(
    checkRow(t("settings.showGrid"), project.settings.showGrid, (checked) => {
      store.mutate((project) => {
        project.settings.showGrid = checked;
      }, "change");
    }),
    checkRow(t("settings.showScale"), project.settings.showCalibration, (checked) => {
      store.mutate((project) => {
        project.settings.showCalibration = checked;
      }, "change");
    }),
    checkRow(t("settings.snap"), project.settings.snapToGeometry, (checked) => {
      store.mutate((project) => {
        project.settings.snapToGeometry = checked;
      }, "change");
    }),
  );

  const snapField = field(t("settings.snapDistance"), el("div", "settings-range"));
  const range = snapField.querySelector<HTMLElement>(".settings-range")!;
  const input = el("input", "input");
  input.type = "range";
  input.min = "2";
  input.max = "24";
  input.step = "1";
  input.value = String(project.settings.snapTolerancePx);
  input.setAttribute("aria-label", t("settings.snapAria"));
  const readout = el("span", "settings-range-value", `${project.settings.snapTolerancePx} px`);
  input.addEventListener("input", () => {
    readout.textContent = `${input.value} px`;
  });
  input.addEventListener("change", () => {
    const value = Math.max(2, Math.min(24, Number(input.value)));
    store.mutate((project) => {
      project.settings.snapTolerancePx = value;
    }, "change");
  });
  range.append(input, readout);
  wrap.append(snapField);
  return wrap;
}

function quantitiesSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.quantitiesTitle"), t("settings.quantitiesNote"));

  const defaultCategory = el("select", "select");
  defaultCategory.setAttribute("aria-label", t("settings.defaultCategory"));
  for (const category of project.categories) {
    defaultCategory.append(
      option(
        category.id,
        category.name,
        category.id === project.settings.quantity.defaultCategoryId,
      ),
    );
  }
  defaultCategory.addEventListener("change", () => {
    store.setDefaultCategory(defaultCategory.value);
  });

  const row = el("div", "field-row");
  const waste = el("input", "input");
  waste.type = "number";
  waste.min = "0";
  waste.max = "100";
  waste.step = "0.5";
  waste.value = String(project.settings.quantity.wastePercent);
  waste.setAttribute("aria-label", t("settings.wasteAria"));
  waste.addEventListener("change", () => {
    const value = Number(waste.value);
    if (waste.value.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) {
      waste.value = String(project.settings.quantity.wastePercent);
      toast(t("settings.wasteInvalid"), "warning");
      return;
    }
    store.setQuantityDefaults({ wastePercent: value });
  });

  const rounding = el("input", "input");
  rounding.type = "number";
  rounding.min = "0";
  rounding.step = "0.01";
  rounding.value = String(project.settings.quantity.roundingStep);
  rounding.setAttribute("aria-label", t("settings.roundingAria"));
  rounding.addEventListener("change", () => {
    const value = Number(rounding.value);
    if (rounding.value.trim() === "" || !Number.isFinite(value) || value < 0) {
      rounding.value = String(project.settings.quantity.roundingStep);
      toast(t("settings.roundingInvalid"), "warning");
      return;
    }
    store.setQuantityDefaults({ roundingStep: value });
  });

  row.append(field(t("settings.wastePercent"), waste), field(t("settings.roundUp"), rounding));
  wrap.append(field(t("settings.defaultCategoryLabel"), defaultCategory), row);

  const manage = el(
    "button",
    "btn btn-small",
    t("settings.manageCategories", { count: project.categories.length }),
  );
  manage.type = "button";
  manage.addEventListener("click", () => {
    void openCategoriesDialog().then(() => {
      openSettingsDialog();
    });
  });
  wrap.append(manage);
  return wrap;
}

function countTypesSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.countTypesTitle"), t("settings.countTypesNote"));
  const manage = el(
    "button",
    "btn btn-small",
    t("settings.manageCountTypes", { count: project.countTypes.length }),
  );
  manage.type = "button";
  manage.addEventListener("click", () => {
    void openCountTypesDialog().then(() => {
      openSettingsDialog();
    });
  });
  wrap.append(manage);
  return wrap;
}

function stampsSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.stampsTitle"), t("settings.stampsNote"));

  const editor = presetEditor(
    project.settings.stampPresets,
    (next) => {
      store.mutate((current) => {
        current.settings.stampPresets = next;
      }, "change");
    },
    t("settings.newPreset"),
  );

  const loadDefaults = el("button", "btn btn-small btn-ghost", t("settings.loadDefaults"));
  loadDefaults.type = "button";
  loadDefaults.addEventListener("click", () => {
    const next = loadGlobalStampPresets();
    store.mutate((current) => {
      current.settings.stampPresets = next;
    }, "change");
    toast(t("settings.stampsUpdated"), "success");
    openSettingsDialog();
  });

  const actions = el("div", "settings-actions");
  actions.append(loadDefaults);
  wrap.append(el("div", "settings-subhead", t("settings.projectPresets")), editor, actions);
  return wrap;
}

export function openSettingsDialog(): void {
  if (!store.project) return;
  const body = el("div", "settings-dialog");
  const content = el("div", "settings-content");
  body.append(content);

  const render = () => {
    if (!store.project) return;
    content.replaceChildren(
      projectSection(),
      metadataSection(),
      scaleSection(),
      unitsSection(),
      labelsSection(),
      displaySection(),
      quantitiesSection(),
      countTypesSection(),
      stampsSection(),
    );
  };
  render();

  void showModal({
    title: t("settings.dialogTitle"),
    subtitle: t("settings.dialogSubtitle"),
    body,
    wide: true,
    className: "modal-settings",
    actions: [{ label: t("settings.close"), value: "close", primary: true }],
  });
}
