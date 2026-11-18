import { el, option } from "../../../ui/dom";
import { showModal } from "../../../ui/dialogs";
import { t } from "../../../i18n";
import { store } from "../../../state/store";
import {
  emptyScheduleDraft,
  findSchedule,
  scheduleDraftFor,
  scheduleDraftProblems,
} from "../model";
import type { ScheduleDraft } from "../model";
import type { ScheduleRowMode, ScheduleSource } from "../../../model/types";
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

  let closeModal: (() => void) | null = null;

  // Save, Duplicate and Delete live in the dialog header beside Close, so the
  // long scrolling body never hides them. The confirmation strip is mounted
  // under the header, outside that body, for the same reason.
  const builderActions = createBuilderActions({
    draft,
    nameInput: name,
    onProblems: updateProblems,
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
      const scrollBody = modal.querySelector(".modal-body");
      modal.insertBefore(builderActions.confirm, scrollBody);
    },
  }).then(() => undefined);
}
