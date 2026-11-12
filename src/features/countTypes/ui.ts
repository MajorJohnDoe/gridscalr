import { COUNT_GLYPHS } from "../../model/countSymbols";
import type { CountGlyph } from "../../model/types";
import { store } from "../../state/store";
import { showModal } from "../../ui/dialogs";
import { clear, el, option } from "../../ui/dom";
import { icon } from "../../ui/icons";
import { toast } from "../../ui/toast";
import {
  addCountType,
  countGlyphLabel,
  countTypeItemCount,
  countTypeLabel,
  countTypeNameError,
  isBuiltInCountType,
  removeCountType,
  renameCountType,
} from "../../model/countTypes";
import { t } from "../../i18n";

function iconButton(markup: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", "icon-btn category-action");
  node.type = "button";
  node.title = label;
  node.setAttribute("aria-label", label);
  node.innerHTML = markup;
  node.addEventListener("click", onClick);
  return node;
}

function glyphSelect(value: CountGlyph, label: string, onChange: (glyph: CountGlyph) => void) {
  const select = el("select", "select count-type-glyph");
  select.setAttribute("aria-label", label);
  for (const glyph of COUNT_GLYPHS) {
    select.append(option(glyph, countGlyphLabel(glyph), glyph === value));
  }
  select.addEventListener("change", () => onChange(select.value as CountGlyph));
  return select;
}

/**
 * Count-type management. Every mutation goes through one store mutation so a
 * rename, glyph change or deletion is one undo step.
 */
export function openCountTypesDialog(): Promise<void> {
  if (!store.project) return Promise.resolve();

  const body = el("div", "form-stack category-manager");
  body.append(el("p", "modal-message", t("countTypeUi.intro")));

  const list = el("div", "category-list");
  const confirm = el("div", "inline-confirm");
  confirm.hidden = true;

  const addRow = el("div", "input-row");
  const addInput = el("input", "input");
  addInput.type = "text";
  addInput.placeholder = t("countTypeUi.newCountType");
  addInput.setAttribute("aria-label", t("countTypeUi.newName"));
  let addGlyph: CountGlyph = "other";
  const addGlyphSelect = glyphSelect("other", t("countTypeUi.newGlyph"), (glyph) => {
    addGlyph = glyph;
  });
  const addButton = el("button", "btn btn-small", t("common.add"));
  addButton.type = "button";
  addRow.append(addInput, addGlyphSelect, addButton);

  const add = () => {
    const project = store.project;
    if (!project) return;
    const error = countTypeNameError(project.countTypes, addInput.value);
    if (error) {
      toast(error, "warning");
      return;
    }
    let created = false;
    store.mutate((current) => {
      created = addCountType(current, addInput.value, addGlyph) !== null;
    }, "change");
    if (!created) {
      toast(t("countTypeUi.addFailed"), "warning");
      return;
    }
    addInput.value = "";
    addGlyph = "other";
    render();
    addInput.focus();
  };

  addButton.addEventListener("click", add);
  addInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  });

  body.append(list, addRow, confirm);

  const hideConfirm = () => {
    confirm.hidden = true;
    clear(confirm);
  };

  const commitRename = (id: string, current: string, input: HTMLInputElement) => {
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
    render();
  };

  const requestDelete = (id: string, label: string) => {
    const project = store.project;
    if (!project) return;
    const usage = countTypeItemCount(project, id);
    const remove = () => {
      let removed = false;
      let reassigned = 0;
      store.mutate((next) => {
        const result = removeCountType(next, id);
        removed = result.removed;
        if (result.removed) reassigned = result.reassigned;
      }, "change");
      if (!removed) {
        toast(t("countTypeUi.builtInCannotDelete"), "warning");
        return;
      }
      toast(
        reassigned > 0
          ? t("countTypeUi.deletedMoved", { name: label, count: reassigned })
          : t("countTypeUi.deleted", { name: label }),
      );
      render();
    };

    if (usage === 0) {
      remove();
      return;
    }

    clear(confirm);
    confirm.hidden = false;
    confirm.append(
      el("p", "inline-confirm-text", t("countTypeUi.used", { name: label, count: usage })),
    );
    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", hideConfirm);
    const deleteButton = el("button", "btn btn-small btn-danger", t("countTypeUi.deleteTitle"));
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => {
      hideConfirm();
      remove();
    });
    actions.append(cancel, deleteButton);
    confirm.append(actions);
    deleteButton.focus();
  };

  const render = () => {
    const project = store.project;
    if (!project) return;
    hideConfirm();
    clear(list);

    for (const type of project.countTypes) {
      const row = el("div", "category-row");
      const label = countTypeLabel(project, type.id);
      const builtIn = isBuiltInCountType(type.id);
      const name = el("input", "input category-name");
      name.type = "text";
      name.value = label;
      name.readOnly = builtIn;
      name.setAttribute("aria-label", t("countTypeUi.nameAria", { name: label }));
      name.addEventListener("change", () => commitRename(type.id, type.label, name));
      name.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          name.blur();
        }
      });

      const usage = countTypeItemCount(project, type.id);
      const meta = el(
        "span",
        "category-meta",
        builtIn
          ? usage > 0
            ? t("countTypeUi.builtInUsage", { count: usage })
            : t("countTypeUi.builtIn")
          : usage > 0
            ? t("countTypeUi.usage", { count: usage })
            : t("countTypeUi.unused"),
      );

      const glyph = glyphSelect(
        type.glyph,
        t("countTypeUi.glyphAria", { name: label }),
        (value) => {
          store.mutate((next) => {
            const target = next.countTypes.find((entry) => entry.id === type.id);
            if (target) target.glyph = value;
          }, "change");
        },
      );

      const actions = el("div", "category-row-actions");
      const remove = iconButton(
        icon("trash", 14),
        t("countTypeUi.deleteAria", { name: label }),
        () => requestDelete(type.id, label),
      );
      remove.disabled = builtIn;
      actions.append(remove);

      row.append(name, glyph, meta, actions);
      list.append(row);
    }
  };

  render();

  return showModal({
    title: t("countTypeUi.title"),
    subtitle: t("countTypeUi.subtitle"),
    body,
    wide: true,
    actions: [{ label: t("countTypeUi.done"), value: "done", primary: true }],
  }).then(() => undefined);
}
