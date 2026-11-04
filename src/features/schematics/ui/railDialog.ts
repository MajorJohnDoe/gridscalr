import { t } from "../../../i18n";
import { store } from "../../../state/store";
import { showModal } from "../../../ui/dialogs";
import { el } from "../../../ui/dom";
import { findItem } from "../../../model/layers";
import { defaultRailRows, type RailPreset } from "../../../model/rail";
import type { RailRow } from "../../../model/types";

/** Edits the rows, labels, legends and display options of one I/O rail. */
export async function openRailDialog(itemId: string): Promise<void> {
  const project = store.project;
  const found = project ? findItem(project, itemId) : undefined;
  if (!found || found.item.kind !== "rail") return;

  let rows: RailRow[] = (found.item.rows?.length ? found.item.rows : defaultRailRows()).map(
    (row) => ({ ...row }),
  );
  let showBadges = found.item.showBadges !== false;
  let showLegend = found.item.showLegend !== false;

  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("rail.dialog.subtitle")));

  const presetRow = el("div", "field-row");
  for (const [preset, label] of [
    ["plc", t("rail.dialog.presetPlc")],
    ["duc", t("rail.dialog.presetDuc")],
  ] as const) {
    const button = el("button", "btn btn-small", label);
    button.type = "button";
    button.addEventListener("click", () => {
      rows = defaultRailRows(preset as RailPreset);
      renderRows();
    });
    presetRow.append(button);
  }
  body.append(presetRow);

  body.append(el("h3", "", t("rail.dialog.rows")));
  const rowsWrap = el("div", "form-stack");
  body.append(rowsWrap);

  const renderRows = () => {
    rowsWrap.replaceChildren();
    rows.forEach((row, index) => {
      const line = el("div", "field-row");
      line.style.display = "grid";
      line.style.gridTemplateColumns = "auto minmax(70px, 1fr) minmax(120px, 2fr) auto";
      line.style.gap = "6px";
      line.style.alignItems = "center";
      line.append(el("span", "field-label", String(index + 1)));

      const label = el("input", "input");
      label.type = "text";
      label.maxLength = 20;
      label.value = row.label;
      label.placeholder = t("rail.dialog.label");
      label.setAttribute("aria-label", t("rail.dialog.label"));
      label.addEventListener("input", () => {
        row.label = label.value;
      });

      const legend = el("input", "input");
      legend.type = "text";
      legend.maxLength = 80;
      legend.value = row.legend ?? "";
      legend.placeholder = t("rail.dialog.legend");
      legend.setAttribute("aria-label", t("rail.dialog.legend"));
      legend.addEventListener("input", () => {
        row.legend = legend.value;
      });

      const remove = el("button", "icon-btn", "×");
      remove.type = "button";
      remove.title = t("rail.dialog.remove");
      remove.setAttribute("aria-label", t("rail.dialog.remove"));
      remove.disabled = rows.length <= 1;
      remove.addEventListener("click", () => {
        rows.splice(index, 1);
        renderRows();
      });

      line.append(label, legend, remove);
      rowsWrap.append(line);
    });

    const add = el("button", "btn btn-small", t("rail.dialog.addRow"));
    add.type = "button";
    add.addEventListener("click", () => {
      rows.push({ id: `row_${rows.length + 1}`, label: "", legend: "" });
      renderRows();
    });
    rowsWrap.append(add);
  };
  renderRows();

  const badgeRow = el("label", "check-row");
  const badgeToggle = el("input");
  badgeToggle.type = "checkbox";
  badgeToggle.checked = showBadges;
  badgeToggle.addEventListener("change", () => {
    showBadges = badgeToggle.checked;
  });
  badgeRow.append(badgeToggle, el("span", "", t("rail.dialog.showBadges")));
  body.append(badgeRow);

  const legendRow = el("label", "check-row");
  const legendToggle = el("input");
  legendToggle.type = "checkbox";
  legendToggle.checked = showLegend;
  legendToggle.addEventListener("change", () => {
    showLegend = legendToggle.checked;
  });
  legendRow.append(legendToggle, el("span", "", t("rail.dialog.showLegend")));
  body.append(legendRow);

  const result = await showModal({
    title: t("rail.dialog.title"),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.apply"), value: "apply", primary: true },
    ],
    onValidate: () => (rows.some((row) => !row.label.trim()) ? t("rail.dialog.emptyLabel") : null),
  });
  if (result !== "apply") return;

  const next = rows
    .map((row, index) => ({
      id: row.id || `row_${index + 1}`,
      label: row.label.replace(/\s+/g, " ").trim().slice(0, 20),
      legend: row.legend?.replace(/\s+/g, " ").trim().slice(0, 80) || undefined,
    }))
    .filter((row) => row.label);

  store.mutate((current) => {
    const target = findItem(current, itemId)?.item;
    if (!target || target.kind !== "rail") return;
    target.rows = next;
    target.showBadges = showBadges ? undefined : false;
    target.showLegend = showLegend ? undefined : false;
    target.updatedAt = new Date().toISOString();
  }, "change");
}
