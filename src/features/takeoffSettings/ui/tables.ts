import {
  deletePlacementsForSchedule,
  deleteSchedule,
  duplicateSchedule,
  openScheduleBuilder,
  placementCount,
} from "../../schedules";
import type { ScheduleDefinition } from "../../../model/types";
import { store } from "../../../state/store";
import { clear, el } from "../../../ui/dom";
import { toast } from "../../../ui/toast";
import { t } from "../../../i18n";

/**
 * Tables tab: the saved takeoff tables, their duplicate and delete actions and
 * the builder entry point. It reuses the schedules feature's definition rules
 * and builder, so a table is still created, edited and deleted by one engine.
 */

export function tablesSection(onReturn: () => void): HTMLElement {
  const root = el("section", "settings-section takeoff-tables");
  root.append(el("h3", "", t("takeoffSettings.tables.title")));
  root.append(el("p", "settings-note", t("takeoffSettings.tables.intro")));

  const confirm = el("div", "inline-confirm");
  confirm.hidden = true;
  const hideConfirm = () => {
    confirm.hidden = true;
    clear(confirm);
  };

  const list = el("ul", "takeoff-table-list");
  const empty = el("p", "takeoff-table-empty", t("takeoffSettings.tables.empty"));

  const render = () => {
    const project = store.project;
    if (!project) return;
    hideConfirm();
    clear(list);
    for (const schedule of project.schedules) list.append(tableRow(schedule));
    empty.hidden = project.schedules.length > 0;
  };

  const requestDelete = (schedule: ScheduleDefinition) => {
    const project = store.project;
    if (!project || store.readOnly) return;
    const placements = placementCount(project, schedule.id);
    const remove = el("button", "btn btn-small btn-danger", t("schedules.builder.delete"));
    remove.type = "button";
    remove.addEventListener("click", () => {
      let removed = false;
      let blocked = false;
      store.mutate((current) => {
        if (placementCount(current, schedule.id) > 0) {
          deletePlacementsForSchedule(current, schedule.id);
        }
        const result = deleteSchedule(current, schedule.id);
        removed = result.removed;
        blocked = result.problems.some((problem) => problem.code === "inUse");
      }, "change");
      if (blocked) {
        toast(t("schedules.problem.inUse"), "warning");
        return;
      }
      if (removed) {
        toast(t("schedules.builder.deleted", { name: schedule.name }), "success");
        render();
      }
    });
    clear(confirm);
    confirm.hidden = false;
    confirm.append(
      el(
        "p",
        "inline-confirm-text",
        placements > 0
          ? t("schedules.builder.deleteMessageWithPlacements", {
              name: schedule.name,
              count: placements,
            })
          : t("schedules.builder.deleteMessage", { name: schedule.name }),
      ),
    );
    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", hideConfirm);
    actions.append(cancel, remove);
    confirm.append(actions);
    remove.focus();
  };

  const tableRow = (schedule: ScheduleDefinition): HTMLLIElement => {
    const item = el("li", "takeoff-table-row");
    item.dataset.scheduleId = schedule.id;
    item.append(el("span", "takeoff-table-name", schedule.name));
    item.append(
      el(
        "span",
        "takeoff-table-meta",
        schedule.source === "spaces"
          ? t("schedules.builder.source.spaces")
          : t("schedules.builder.source.measurements"),
      ),
    );

    const actions = el("div", "takeoff-table-actions");
    const edit = el("button", "btn btn-small btn-ghost", t("schedules.editSchedule"));
    edit.type = "button";
    edit.disabled = store.readOnly;
    edit.addEventListener("click", () => {
      void openScheduleBuilder(schedule.id).then(onReturn);
    });
    const duplicate = el("button", "btn btn-small btn-ghost", t("schedules.builder.duplicate"));
    duplicate.type = "button";
    duplicate.disabled = store.readOnly;
    duplicate.addEventListener("click", () => {
      let copyName = "";
      store.mutate((current) => {
        copyName = duplicateSchedule(current, schedule.id)?.name ?? "";
      }, "change");
      if (copyName) {
        toast(t("schedules.builder.created", { name: copyName }), "success");
        render();
      }
    });
    const remove = el("button", "btn btn-small btn-ghost", t("schedules.builder.delete"));
    remove.type = "button";
    remove.disabled = store.readOnly;
    remove.addEventListener("click", () => requestDelete(schedule));
    actions.append(edit, duplicate, remove);
    item.append(actions);
    return item;
  };

  const create = el("button", "btn btn-small btn-primary", t("schedules.newSchedule"));
  create.type = "button";
  create.disabled = store.readOnly;
  create.addEventListener("click", () => {
    void openScheduleBuilder().then(onReturn);
  });

  render();
  root.append(list, empty, confirm, create);
  return root;
}
