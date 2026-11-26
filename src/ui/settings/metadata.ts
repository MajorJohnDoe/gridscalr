import { t } from "../../i18n";
import { ingestImageBlob } from "../../io/imageIngest";
import { pickImage } from "../../io/platform";
import { describeError } from "../../io/platformError";
import { updateProjectMetadata, updateReportLogo } from "../../model/commands/settings";
import type { ProjectMetadata } from "../../model/types";
import { store } from "../../state/store";
import { el } from "../dom";
import { field, section } from "../settingsControls";
import { toast } from "../toast";

function metadataPatch(key: keyof ProjectMetadata, value: string): Partial<ProjectMetadata> {
  return { [key]: value };
}

export function metadataSection(onRefresh: () => void): HTMLElement {
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
        updateProjectMetadata(next, metadataPatch(key, input.value));
      }, "change");
    });
    wrap.append(field(label, input));
  }
  const notes = el("textarea", "input textarea");
  notes.value = project.metadata.notes;
  notes.setAttribute("aria-label", t("report.meta.notes"));
  notes.addEventListener("change", () => {
    store.mutate((next) => {
      updateProjectMetadata(next, { notes: notes.value });
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
          updateReportLogo(next, asset);
        }, "change");
        onRefresh();
      } catch (error) {
        toast(describeError(error), "warning");
      }
    })();
  });
  logoActions.append(chooseLogo);
  if (currentLogo) {
    const removeLogo = el("button", "btn btn-small", t("settings.removeLogo"));
    removeLogo.type = "button";
    removeLogo.addEventListener("click", () => {
      store.mutate((next) => {
        updateReportLogo(next, null);
      }, "change");
      onRefresh();
    });
    logoActions.append(removeLogo);
  }
  logoRow.append(logoActions);
  wrap.append(el("p", "settings-note", t("settings.logoNote")), logoRow);
  return wrap;
}
