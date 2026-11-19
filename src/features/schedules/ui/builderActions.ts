import { clear, el } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import { toast } from "../../../ui/toast";
import { revalidateTargetNow } from "../../../ui/dialogs";
import { t } from "../../../i18n";
import { store } from "../../../state/store";
import {
  createSchedule,
  deleteSchedule,
  normalizeScheduleName,
  uniqueScheduleName,
  updateSchedule,
} from "../model";
import type { ScheduleDraft, ScheduleMutationResult, ScheduleProblem } from "../model";
import { deletePlacementsForSchedule, placementCount } from "../placement";

/**
 * The takeoff table builder's header actions: Save, Duplicate and Delete, shown
 * beside the dialog close control so saving never needs a scroll. The rules are
 * the builder's own: one store mutation per action, so each is one undo step,
 * the same duplicate naming, and a delete that revalidates its table first.
 *
 * Save and Duplicate keep the window open. The builder is a movable, non-modal
 * window (ADR 0017), so saving is not a reason to lose the drawing behind it or
 * the draft in front of it. Delete still closes, because the table is gone.
 */

export interface BuilderActionHost {
  draft: ScheduleDraft;
  /** The name field, focused when Save refuses an empty name. */
  nameInput: HTMLInputElement;
  /** Re-renders the problem summary after a refused action. */
  onProblems: (problems?: readonly ScheduleProblem[]) => void;
  /** Repaints the builder body and preview in place after a successful save. */
  onSaved: () => void;
  /** Closes the builder window after a delete removed the table. */
  close: () => void;
}

export interface BuilderActions {
  /** Header controls in the documented order: Save, Duplicate, Delete. */
  actions: HTMLButtonElement[];
  /** The delete confirmation strip; the dialog mounts it under its header. */
  confirm: HTMLElement;
  /** Re-applies the enabled rules after the draft gained an identity. */
  sync: () => void;
}

function headerAction(options: {
  label: string;
  iconName: string;
  primary?: boolean;
  danger?: boolean;
}): HTMLButtonElement {
  const classes = ["btn", "btn-small", "modal-header-action"];
  if (options.primary) classes.push("btn-primary");
  if (options.danger) classes.push("btn-danger");
  const button = el("button", classes.join(" "));
  button.type = "button";
  // The label is the accessible name and the tooltip; the visible text is
  // hidden on a narrow header, so the button never depends on it.
  button.setAttribute("aria-label", options.label);
  button.title = options.label;
  button.innerHTML = icon(options.iconName, 15);
  button.append(el("span", "modal-header-action-label", options.label));
  return button;
}

/**
 * Revalidates the delete target by stable id, so a table removed or renamed
 * behind the non-modal confirmation cannot be deleted by mistake.
 */
function deleteProblem(id: string, name: string): string | null {
  return revalidateTargetNow({
    kind: "schedule",
    id,
    name,
    resolve: () => (store.project?.schedules.some((entry) => entry.id === id) ? id : null),
  });
}

export function createBuilderActions(host: BuilderActionHost): BuilderActions {
  const { draft } = host;

  const save = headerAction({
    label: t("schedules.builder.save"),
    iconName: "save",
    primary: true,
  });
  save.disabled = store.readOnly;
  const duplicate = headerAction({
    label: t("schedules.builder.duplicate"),
    iconName: "copy",
  });
  duplicate.disabled = store.readOnly;
  const remove = headerAction({
    label: t("schedules.builder.delete"),
    iconName: "trash",
    danger: true,
  });
  remove.disabled = store.readOnly || !draft.id;

  /** The enabled rules depend on the draft's identity, which a save creates. */
  const sync = (): void => {
    save.disabled = store.readOnly;
    duplicate.disabled = store.readOnly;
    remove.disabled = store.readOnly || !draft.id;
  };

  const confirm = el("div", "inline-confirm schedules-builder-confirm");
  confirm.hidden = true;
  const hideConfirm = () => {
    confirm.hidden = true;
    clear(confirm);
  };

  save.addEventListener("click", () => {
    if (store.readOnly) return;
    if (!normalizeScheduleName(draft.name)) {
      host.nameInput.focus();
      host.onProblems();
      return;
    }
    const creating = !draft.id;
    let result: ScheduleMutationResult | null = null;
    store.mutate((current) => {
      result = draft.id ? updateSchedule(current, draft) : createSchedule(current, draft);
    }, "change");
    const applied = result as ScheduleMutationResult | null;
    if (!applied?.schedule) {
      host.onProblems(applied?.problems);
      return;
    }
    const saved = applied.schedule;
    // Adopt the created id and the stored name, so the next Save updates this
    // table instead of creating a second one and the field shows what the
    // project actually holds (the model may have made the name unique).
    draft.id = saved.id;
    draft.name = saved.name;
    if (host.nameInput.value !== saved.name) host.nameInput.value = saved.name;
    toast(
      creating
        ? t("schedules.builder.created", { name: saved.name })
        : t("schedules.builder.saved", { name: saved.name }),
      "success",
    );
    // The window stays open: the drawing behind it is the reason the dialog is
    // non-modal, and the draft is still the thing being edited.
    host.onSaved();
  });

  duplicate.addEventListener("click", () => {
    if (store.readOnly) return;
    let copyName = "";
    store.mutate((current) => {
      const result = createSchedule(current, {
        ...draft,
        id: undefined,
        name: uniqueScheduleName(
          current,
          t("schedules.builder.copyName", {
            name: draft.name || t("schedules.builder.defaultName"),
          }),
        ),
      });
      copyName = result.schedule?.name ?? "";
    }, "change");
    if (!copyName) {
      host.onProblems();
      return;
    }
    // The copy is added to the project and the editor stays on the original
    // draft, so one click makes exactly one copy and one undo removes exactly
    // that copy without leaving the open editor pointing at a table that is
    // gone.
    toast(t("schedules.builder.created", { name: copyName }), "success");
  });

  remove.addEventListener("click", () => {
    const id = draft.id;
    if (store.readOnly || !id) return;
    const name = draft.name;
    const project = store.project;
    const placements = project ? placementCount(project, id) : 0;
    clear(confirm);
    confirm.append(
      el(
        "p",
        "inline-confirm-text",
        placements > 0
          ? t("schedules.builder.deleteMessageWithPlacements", { name, count: placements })
          : t("schedules.builder.deleteMessage", { name }),
      ),
    );
    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", hideConfirm);
    const destroy = el("button", "btn btn-small btn-danger", t("schedules.builder.delete"));
    destroy.type = "button";
    destroy.addEventListener("click", () => {
      const problem = deleteProblem(id, name);
      if (problem) {
        hideConfirm();
        toast(problem, "warning");
        return;
      }
      let removed = false;
      let blocked = false;
      store.mutate((current) => {
        if (placementCount(current, id) > 0) deletePlacementsForSchedule(current, id);
        const result = deleteSchedule(current, id);
        removed = result.removed;
        blocked = result.problems.some((problem) => problem.code === "inUse");
      }, "change");
      if (blocked) {
        toast(t("schedules.problem.inUse"), "warning");
        return;
      }
      if (removed) {
        toast(t("schedules.builder.deleted", { name }), "success");
        host.close();
      }
    });
    actions.append(cancel, destroy);
    confirm.append(actions);
    confirm.hidden = false;
    destroy.focus();
  });

  return { actions: [save, duplicate, remove], confirm, sync };
}
