import { clear, el, option } from "../../../ui/dom";
import { showModal } from "../../../ui/dialogs";
import { toast } from "../../../ui/toast";
import { t } from "../../../i18n";
import { store } from "../../../state/store";
import {
  createSchedule,
  deleteSchedule,
  emptyScheduleDraft,
  findSchedule,
  normalizeScheduleName,
  scheduleDraftFor,
  scheduleDraftProblems,
  uniqueScheduleName,
  updateSchedule,
} from "../model";
import type { ScheduleDraft, ScheduleMutationResult } from "../model";
import type { ScheduleRowMode, ScheduleSource } from "../../../model/types";
import { createPreview } from "./builderPreview";
import { columnsSection } from "./builderColumns";
import { filtersSection } from "./builderFilters";
import { rulesSection } from "./builderRules";
import type { BuilderContext } from "./builderContext";
import { scheduleProblemText } from "./messages";

/**
 * The schedule builder. It edits one draft, previews it with the real engine and
 * writes it back in one store mutation, so a save is one undo step. Existing
 * schedules can be edited, duplicated and deleted; a delete that a placement
 * still references is refused with an explicit message.
 */

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const wrap = el("label", "field");
  wrap.append(el("span", "field-label", labelText), control);
  return wrap;
}

export function openScheduleBuilder(scheduleId?: string): Promise<void> {
  const project = store.project;
  if (!project) return Promise.resolve();
  const currentProject = project;
  const existing = findSchedule(currentProject, scheduleId);
  const draft: ScheduleDraft = existing
    ? scheduleDraftFor(existing)
    : emptyScheduleDraft(currentProject);

  const body = el("div", "form-stack schedules-builder");
  const top = el("div", "schedules-builder-top");
  const sections = el("div", "schedules-builder-sections");
  const problems = el("div", "schedules-builder-problems");
  problems.setAttribute("role", "status");

  const name = el("input", "input schedules-builder-name");
  name.type = "text";
  name.value = draft.name;
  name.setAttribute("aria-label", t("schedules.builder.name"));
  name.addEventListener("input", () => {
    draft.name = name.value;
    updateProblems();
    preview.update(draft);
  });

  const source = el("select", "select schedules-builder-source");
  source.setAttribute("aria-label", t("schedules.builder.source"));
  source.append(
    option(
      "measurements",
      t("schedules.builder.source.measurements"),
      draft.source === "measurements",
    ),
    option("spaces", t("schedules.builder.source.spaces"), draft.source === "spaces"),
  );
  source.addEventListener("change", () => {
    const nextSource = source.value as ScheduleSource;
    const defaults = emptyScheduleDraft(currentProject, nextSource);
    // A source change invalidates every reference; start from its own columns
    // rather than carrying a filter or group that cannot resolve.
    draft.source = nextSource;
    draft.columns = defaults.columns;
    draft.filters = {};
    delete draft.groupBy;
    draft.sort = [];
    draft.totals = [];
    rebuild();
  });

  const rowMode = el("select", "select schedules-builder-row-mode");
  rowMode.setAttribute("aria-label", t("schedules.builder.rowMode"));
  rowMode.append(
    option("items", t("schedules.builder.rowMode.items"), draft.rowMode === "items"),
    option("grouped", t("schedules.builder.rowMode.grouped"), draft.rowMode === "grouped"),
  );
  rowMode.addEventListener("change", () => {
    draft.rowMode = rowMode.value as ScheduleRowMode;
    rebuild();
  });

  top.append(
    field(t("schedules.builder.name"), name),
    field(t("schedules.builder.source"), source),
    field(t("schedules.builder.rowMode"), rowMode),
  );
  body.append(top, el("p", "settings-note", t("schedules.builder.rowModeNote")));

  const preview = createPreview(currentProject);

  function updateProblems(): void {
    const list = scheduleDraftProblems(currentProject, draft);
    problems.replaceChildren();
    for (const problem of list) {
      const fieldLabel = problem.ref
        ? draft.columns.find((column) => column.field === problem.ref)?.label
        : undefined;
      problems.append(el("p", "form-warning", scheduleProblemText(problem, { field: fieldLabel })));
    }
  }

  function rebuild(): void {
    sections.replaceChildren(
      columnsSection(ctx),
      rulesSection(ctx),
      filtersSection(ctx),
      preview.element,
    );
    updateProblems();
    preview.update(draft);
  }

  function refresh(): void {
    updateProblems();
    preview.update(draft);
  }

  const ctx: BuilderContext = { project: currentProject, draft, rebuild, refresh };

  const toolbar = el("div", "input-row schedules-builder-actions");
  const save = el("button", "btn btn-primary", t("schedules.builder.save"));
  save.type = "button";
  save.disabled = store.readOnly;
  const duplicate = el("button", "btn", t("schedules.builder.duplicate"));
  duplicate.type = "button";
  duplicate.disabled = store.readOnly;
  const remove = el("button", "btn btn-danger", t("schedules.builder.delete"));
  remove.type = "button";
  remove.disabled = store.readOnly || !draft.id;

  let closeModal: (() => void) | null = null;

  save.addEventListener("click", () => {
    if (store.readOnly) return;
    if (!normalizeScheduleName(draft.name)) {
      name.focus();
      updateProblems();
      return;
    }
    let result: ScheduleMutationResult | null = null;
    store.mutate((current) => {
      result = draft.id ? updateSchedule(current, draft) : createSchedule(current, draft);
    }, "change");
    const applied = result as ScheduleMutationResult | null;
    if (!applied?.schedule) {
      updateProblems();
      return;
    }
    toast(
      draft.id
        ? t("schedules.builder.saved", { name: applied.schedule.name })
        : t("schedules.builder.created", { name: applied.schedule.name }),
      "success",
    );
    closeModal?.();
  });

  duplicate.addEventListener("click", () => {
    if (store.readOnly) return;
    let created = false;
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
      created = Boolean(result.schedule);
      copyName = result.schedule?.name ?? "";
    }, "change");
    if (!created) {
      updateProblems();
      return;
    }
    toast(t("schedules.builder.created", { name: copyName }), "success");
    closeModal?.();
  });

  const confirm = el("div", "inline-confirm");
  confirm.hidden = true;

  remove.addEventListener("click", () => {
    const id = draft.id;
    if (store.readOnly || !id) return;
    clear(confirm);
    confirm.append(
      el("p", "inline-confirm-text", t("schedules.builder.deleteMessage", { name: draft.name })),
    );
    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      confirm.hidden = true;
      clear(confirm);
    });
    const destroy = el("button", "btn btn-small btn-danger", t("schedules.builder.delete"));
    destroy.type = "button";
    destroy.addEventListener("click", () => {
      let removed = false;
      let blocked = false;
      store.mutate((current) => {
        const result = deleteSchedule(current, id);
        removed = result.removed;
        blocked = result.problems.some((problem) => problem.code === "inUse");
      }, "change");
      if (blocked) {
        toast(t("schedules.problem.inUse"), "warning");
        return;
      }
      if (removed) {
        toast(t("schedules.builder.deleted", { name: draft.name }), "success");
        closeModal?.();
      }
    });
    actions.append(cancel, destroy);
    confirm.append(actions);
    confirm.hidden = false;
    destroy.focus();
  });

  toolbar.append(save, duplicate, remove);
  body.append(sections, problems, confirm, toolbar);
  rebuild();

  return showModal({
    title: existing ? t("schedules.builder.titleEdit") : t("schedules.builder.titleNew"),
    subtitle: t("schedules.builder.subtitle"),
    body,
    wide: true,
    actions: [{ label: t("common.close"), value: "close" }],
    onMount: (_modal, close) => {
      closeModal = close;
    },
  }).then(() => undefined);
}
