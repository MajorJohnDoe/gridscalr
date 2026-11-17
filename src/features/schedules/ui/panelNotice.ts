import type { PageSize } from "../../../model/types";
import { store } from "../../../state/store";
import { el } from "../../../ui/dom";
import { toast } from "../../../ui/toast";
import { t } from "../../../i18n";
import { openScheduleBuilder } from "./builder";
import { createAndPlaceStandardSchedule, createStandardSchedule } from "./placement";

/**
 * The Takeoff tab's notices: the labelled preview that offers the standard
 * table, the no-rows hint, and the one visible reason a control stays disabled.
 * Opening the tab renders these only; every write starts from an explicit
 * action, so viewing a project never marks it dirty.
 */

export const ACTION_REASON_ID = "schedules-action-reason";

/** The part of the panel host the notices need. */
export interface PreviewHost {
  refresh?: () => void;
  goToPage?: (page: number) => void;
  pageSize?: (page: number) => PageSize | undefined;
}

export function explainDisabled(button: HTMLButtonElement, reason: string): void {
  button.disabled = true;
  button.title = reason;
  button.setAttribute("aria-describedby", ACTION_REASON_ID);
}

export function previewNotice(host: PreviewHost): HTMLElement {
  const block = el("div", "schedules-preview");
  const text = el("div", "schedules-preview-text");
  text.append(
    el("p", "schedules-preview-title", t("schedules.preview.title")),
    el("p", "schedules-preview-hint", t("schedules.preview.hint")),
  );
  const actions = el("div", "schedules-preview-actions");

  const create = el("button", "btn btn-small btn-primary", t("schedules.preview.create"));
  create.type = "button";
  create.dataset.summaryFocus = "preview-create";
  const createPlace = el(
    "button",
    "btn btn-small schedules-preview-place",
    t("schedules.preview.createAndPlace"),
  );
  createPlace.type = "button";
  createPlace.dataset.summaryFocus = "preview-create-place";

  if (store.readOnly) {
    const reason = t("schedules.action.readOnly");
    explainDisabled(create, reason);
    explainDisabled(createPlace, reason);
  } else {
    create.title = t("schedules.preview.createHint");
    create.addEventListener("click", () => {
      const schedule = createStandardSchedule();
      if (!schedule) return;
      toast(t("schedules.builder.created", { name: schedule.name }), "success");
      host.refresh?.();
    });
    createPlace.title = t("schedules.preview.createAndPlaceHint");
    createPlace.addEventListener("click", () => {
      void createAndPlaceStandardSchedule(host);
    });
  }

  actions.append(create, createPlace);
  block.append(text, actions);
  return block;
}

export function emptyState(host: PreviewHost, options: { withCreate?: boolean } = {}): HTMLElement {
  const block = el("div", "schedules-empty");
  block.append(el("p", "schedules-empty-title", t("schedules.empty")));
  block.append(el("p", "schedules-empty-hint", t("schedules.emptyHint")));
  if (options.withCreate === false) return block;
  const create = el("button", "btn btn-small btn-primary", t("schedules.newSchedule"));
  create.type = "button";
  if (store.readOnly) {
    explainDisabled(create, t("schedules.action.readOnly"));
  } else {
    create.addEventListener("click", () => void openScheduleBuilder().then(() => host.refresh?.()));
  }
  block.append(create);
  return block;
}
