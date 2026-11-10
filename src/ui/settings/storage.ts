import { formatBytes, isTauri } from "../../io/platform";
import { totalPageCount } from "../../model/documents";
import { sourceStatus, type SourceFileState } from "../../source/sourceStatus";
import { store } from "../../state/store";
import { el } from "../dom";
import { section } from "../settingsControls";
import { t } from "../../i18n";

function bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function sourceStateLabel(state: SourceFileState): string {
  if (state === "missing") return t("settings.sourceMissing");
  if (state === "changed") return t("settings.sourceChanged");
  return t("settings.sourceOk");
}

function buildSection(): HTMLElement {
  const project = store.project;
  if (!project) return el("div");
  const wrap = section(t("settings.storageTitle"), t("settings.storageNote"));
  const assets = Object.values(project.assets ?? {});
  const imageBytes = assets.reduce((sum, asset) => sum + bytes(asset.data ?? ""), 0);
  const ocrBytes = Object.values(project.pages).reduce(
    (sum, page) => sum + (page.state.ocr ? bytes(JSON.stringify(page.state.ocr)) : 0),
    0,
  );
  const items = project.layers.reduce((sum, layer) => sum + layer.items.length, 0);
  wrap.append(
    el(
      "p",
      "settings-note",
      t("settings.storageSize", { size: formatBytes(bytes(JSON.stringify(project))) }),
    ),
    el(
      "p",
      "settings-note",
      t("settings.storageImages", { size: formatBytes(imageBytes), count: assets.length }),
    ),
    el("p", "settings-note", t("settings.storageOcr", { size: formatBytes(ocrBytes) })),
    el(
      "p",
      "settings-note",
      t("settings.storageItems", { items, pages: totalPageCount(project.documents) }),
    ),
  );

  const summary = sourceStatus.summary;
  if (!isTauri) {
    wrap.append(el("p", "settings-note", t("settings.sourceDesktopOnly")));
  } else if (!summary.checked || !summary.statuses.length) {
    wrap.append(el("p", "settings-note", t("settings.sourceChecking")));
  } else {
    for (const status of summary.statuses) {
      const line = el("p", "settings-note");
      line.textContent = t("settings.sourceMode", {
        name: status.name,
        mode:
          status.storage === "managed"
            ? t("sourceStorage.modeManaged")
            : t("sourceStorage.modeReference"),
        state: sourceStateLabel(status.state),
      });
      if (status.state !== "ok") line.classList.add("is-warning-text");
      wrap.append(line);
    }
  }
  return wrap;
}

export function storageSection(): HTMLElement {
  const wrap = buildSection();
  if (isTauri) {
    void sourceStatus.refresh().then(() => {
      if (!wrap.isConnected) return;
      wrap.replaceWith(buildSection());
    });
  }
  return wrap;
}
