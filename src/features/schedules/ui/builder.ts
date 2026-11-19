import { el, option } from "../../../ui/dom";
import { setDialogTitle, showModal } from "../../../ui/dialogs";
import { t } from "../../../i18n";
import { store } from "../../../state/store";
import {
  emptyScheduleDraft,
  findSchedule,
  scheduleDraftFor,
  scheduleDraftProblems,
} from "../model";
import type { ScheduleDraft, ScheduleProblem } from "../model";
import type { Project, ScheduleRowMode, ScheduleSource } from "../../../model/types";
import { createPreview } from "./builderPreview";
import { createBuilderActions } from "./builderActions";
import { columnsSection } from "./builderColumns";
import { filtersSection } from "./builderFilters";
import { rulesSection } from "./builderRules";
import type { BuilderContext } from "./builderContext";
import { scheduleProblemText } from "./messages";

/**
 * The takeoff table builder. It edits one draft, previews it with the real engine and
 * writes it back in one store mutation, so a save is one undo step. Existing
 * schedules can be edited, duplicated and deleted; a delete that a placement
 * still references is refused with an explicit message.
 *
 * The window is a movable, non-modal dialog (ADR 0017), so a save repaints the
 * builder in place instead of closing it: the drawing behind the window is what
 * the user saves to inspect, and the draft stays editable.
 */

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const wrap = el("label", "field");
  wrap.append(el("span", "field-label", labelText), control);
  return wrap;
}

export function openScheduleBuilder(scheduleId?: string): Promise<void> {
  const project = store.project;
  if (!project) return Promise.resolve();
  const openedWith = project;
  const existing = findSchedule(openedWith, scheduleId);
  const draft: ScheduleDraft = existing
    ? scheduleDraftFor(existing)
    : emptyScheduleDraft(openedWith);

  // The window outlives a save and can stay open while the project changes
  // behind it, so every read goes through the live project and only falls back
  // to the snapshot when the project is closed.
  const liveProject = (): Project => store.project ?? openedWith;

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
    const defaults = emptyScheduleDraft(liveProject(), nextSource);
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

  const preview = createPreview(liveProject);

  function updateProblems(extra: readonly ScheduleProblem[] = []): void {
    const list = [...scheduleDraftProblems(liveProject(), draft)];
    // A refused write reports its own problem, for example a table that an undo
    // removed while the window stayed open. The draft check already names the
    // control-level problems, so a repeated code is shown once.
    for (const problem of extra) {
      const duplicate = list.some(
        (entry) =>
          entry.code === problem.code &&
          entry.ref === problem.ref &&
          entry.fieldId === problem.fieldId,
      );
      if (!duplicate) list.push(problem);
    }
    problems.replaceChildren();
    for (const problem of list) {
      const fieldLabel = problem.ref
        ? draft.columns.find((column) => column.field === problem.ref)?.label
        : undefined;
      problems.append(el("p", "form-warning", scheduleProblemText(problem, { field: fieldLabel })));
    }
  }

  function rebuild(): void {
    ctx.project = liveProject();
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
    ctx.project = liveProject();
    updateProblems();
    preview.update(draft);
  }

  const ctx: BuilderContext = { project: liveProject(), draft, rebuild, refresh };

  let closeModal: (() => void) | null = null;
  let modalElement: HTMLElement | null = null;
  let scrollBody: HTMLElement | null = null;

  // Save, Duplicate and Delete live in the dialog header beside Close, so the
  // long scrolling body never hides them. The confirmation strip is mounted
  // under the header, outside that body, for the same reason.
  const builderActions = createBuilderActions({
    draft,
    nameInput: name,
    onProblems: (list) => updateProblems(list),
    onSaved: () => {
      // Repaint in place and keep the reader where they were: a save must not
      // move the window, the scroll position or the focus.
      const scrollTop = scrollBody?.scrollTop ?? 0;
      rebuild();
      builderActions.sync();
      if (modalElement) setDialogTitle(modalElement, t("schedules.builder.titleEdit"));
      if (scrollBody) scrollBody.scrollTop = scrollTop;
    },
    close: () => closeModal?.(),
  });

  body.append(sections, problems);
  rebuild();

  return showModal({
    title: existing ? t("schedules.builder.titleEdit") : t("schedules.builder.titleNew"),
    subtitle: t("schedules.builder.subtitle"),
    body,
    wide: true,
    actions: [{ label: t("common.close"), value: "close" }],
    headerActions: builderActions.actions,
    onMount: (modal, close) => {
      closeModal = close;
      modalElement = modal;
      scrollBody = modal.querySelector<HTMLElement>(".modal-body");
      modal.insertBefore(builderActions.confirm, scrollBody);
    },
  }).then(() => undefined);
}
