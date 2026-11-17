import { COUNT_GLYPHS } from "../../model/countSymbols";
import {
  countGlyphLabel,
  countTypeItemCount,
  countTypeLabel,
  countTypeNameError,
  isBuiltInCountType,
  removeCountType,
  renameCountType,
} from "../../model/countTypes";
import type { CountGlyph } from "../../model/types";
import { store } from "../../state/store";
import { el, option } from "../../ui/dom";
import { icon } from "../../ui/icons";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";

/**
 * The counted-object rows of the Takeoff settings hub. The rules stay in
 * `src/model/countTypes.ts`; this module owns only the row presentation, so the
 * hub and a future surface share one editor and one set of aria labels.
 */

export interface CountTypeRowOptions {
  /** Repaints the Objects tab after a rename or glyph change. */
  onChanged: () => void;
  /** The hub owns the shared delete confirmation. */
  onDelete: (id: string, label: string) => void;
  /** Field labels whose applies-to rule names this count type. */
  appliesTo: (id: string) => string[];
}

function glyphSelect(
  value: CountGlyph,
  label: string,
  onChange: (glyph: CountGlyph) => void,
): HTMLSelectElement {
  const select = el("select", "select count-type-glyph");
  select.setAttribute("aria-label", label);
  for (const glyph of COUNT_GLYPHS) {
    select.append(option(glyph, countGlyphLabel(glyph), glyph === value));
  }
  select.addEventListener("change", () => onChange(select.value as CountGlyph));
  return select;
}

function commitRename(
  id: string,
  current: string,
  input: HTMLInputElement,
  onChanged: () => void,
): void {
  const project = store.project;
  if (!project) return;
  if (input.value.trim() === current) {
    input.value = current;
    return;
  }
  const error = countTypeNameError(project.countTypes, input.value, id);
  if (error) {
    toast(error, "warning");
    input.value = current;
    return;
  }
  store.mutate((next) => {
    renameCountType(next, id, input.value);
  }, "change");
  onChanged();
}

/** One table row per project count type, in stored order. */
export function countTypeObjectRows(options: CountTypeRowOptions): HTMLTableRowElement[] {
  const project = store.project;
  if (!project) return [];
  return project.countTypes.map((type) => {
    const label = countTypeLabel(project, type.id);
    const builtIn = isBuiltInCountType(type.id);
    const usage = countTypeItemCount(project, type.id);

    const row = el("tr", "takeoff-object-row takeoff-object-counted");
    row.dataset.objectId = type.id;
    row.dataset.objectKind = "counted";

    const nameCell = el("th", "takeoff-object-name");
    nameCell.scope = "row";
    const name = el("input", "input category-name");
    name.type = "text";
    name.value = label;
    name.readOnly = builtIn;
    name.setAttribute("aria-label", t("countTypeUi.nameAria", { name: label }));
    name.addEventListener("change", () =>
      commitRename(type.id, type.label, name, options.onChanged),
    );
    name.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        name.blur();
      }
    });
    nameCell.append(name);

    const typeCell = el("td");
    typeCell.append(el("span", "status-chip", t("takeoffSettings.objects.counted")));

    const glyphCell = el("td", "takeoff-object-glyph");
    glyphCell.append(
      el("span", "takeoff-object-symbol", countGlyphLabel(type.glyph)),
      glyphSelect(type.glyph, t("countTypeUi.glyphAria", { name: label }), (value) => {
        store.mutate((next) => {
          const target = next.countTypes.find((entry) => entry.id === type.id);
          if (target) target.glyph = value;
        }, "change");
        options.onChanged();
      }),
    );

    const piecesCell = el("td", "takeoff-object-pieces");
    piecesCell.append(
      el(
        "span",
        "takeoff-object-meta",
        builtIn
          ? usage > 0
            ? t("countTypeUi.builtInUsage", { count: usage })
            : t("countTypeUi.builtIn")
          : usage > 0
            ? t("countTypeUi.usage", { count: usage })
            : t("countTypeUi.unused"),
      ),
      el("span", "takeoff-object-hint", t("takeoffSettings.objects.piecesHint")),
    );

    const labels = options.appliesTo(type.id);
    const appliesCell = el("td", "takeoff-object-applies");
    appliesCell.textContent = labels.length
      ? labels.join(", ")
      : t("takeoffSettings.objects.appliesAll");

    const actions = el("td", "takeoff-object-actions");
    const remove = el("button", "icon-btn category-action");
    remove.type = "button";
    remove.title = t("countTypeUi.deleteAria", { name: label });
    remove.setAttribute("aria-label", t("countTypeUi.deleteAria", { name: label }));
    remove.innerHTML = icon("trash", 14);
    remove.disabled = builtIn;
    remove.addEventListener("click", () => options.onDelete(type.id, label));
    actions.append(remove);

    row.append(nameCell, typeCell, glyphCell, piecesCell, appliesCell, actions);
    return row;
  });
}

/** Removes one custom type in one undo step; returns the reassigned count. */
export function deleteCountType(id: string): { removed: boolean; reassigned: number } {
  let removed = false;
  let reassigned = 0;
  store.mutate((next) => {
    const result = removeCountType(next, id);
    removed = result.removed;
    if (result.removed) reassigned = result.reassigned;
  }, "change");
  return { removed, reassigned };
}
