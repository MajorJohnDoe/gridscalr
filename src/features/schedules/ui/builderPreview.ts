import { el } from "../../../ui/dom";
import { t } from "../../../i18n";
import type { Project, ScheduleDefinition } from "../../../model/types";
import { computeSchedule, scheduleDisplayEntries } from "../model";
import type { ScheduleDraft } from "../model";
import {
  scheduleCaption,
  scheduleEmptyRow,
  scheduleGroupRowElement,
  scheduleHead,
  scheduleRowElement,
  scheduleTotalRow,
} from "./tableParts";

/**
 * The builder's live preview: the first 20 display entries of an unsaved
 * definition, computed with the same engine the panel uses. Totals still cover
 * every filtered row, so a preview cannot flatter the real table.
 */

const PREVIEW_ROWS = 20;

function previewDefinition(draft: ScheduleDraft): ScheduleDefinition {
  const now = new Date().toISOString();
  return {
    id: draft.id ?? "schedule_preview",
    name: draft.name,
    source: draft.source,
    rowMode: draft.rowMode,
    columns: draft.columns,
    filters: draft.filters,
    ...(draft.groupBy ? { groupBy: draft.groupBy } : {}),
    ...(draft.sort.length ? { sort: draft.sort } : {}),
    ...(draft.totals.length ? { totals: draft.totals } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export interface BuilderPreview {
  element: HTMLElement;
  update: (draft: ScheduleDraft) => void;
}

export function createPreview(getProject: () => Project): BuilderPreview {
  const element = el("section", "schedules-builder-section schedules-builder-preview");
  const title = el("h3", "schedules-builder-title", t("schedules.builder.preview"));
  const count = el("span", "schedules-builder-count", "");
  const head = el("div", "schedules-builder-section-head");
  head.append(title, count);
  const body = el("div", "schedules-preview-body");
  body.tabIndex = 0;
  body.setAttribute("role", "region");
  body.setAttribute("aria-label", t("schedules.builder.preview"));
  element.append(head, body);

  const update = (draft: ScheduleDraft) => {
    const result = computeSchedule(getProject(), previewDefinition(draft));
    const entries = scheduleDisplayEntries(result).slice(0, PREVIEW_ROWS);
    count.textContent = t("schedules.builder.previewCount", {
      shown: entries.length,
      total: result.rowCount,
    });
    body.replaceChildren();
    const table = el("table", "schedules-table schedules-preview-table");
    table.style.minWidth = `${Math.max(320, result.columns.length * 84)}px`;
    table.append(scheduleCaption(t("schedules.builder.previewCaption", { name: draft.name })));
    const thead = el("thead");
    thead.append(scheduleHead(result.columns));
    const tbody = el("tbody");
    if (!entries.length) {
      tbody.append(scheduleEmptyRow(result.columns.length, t("schedules.table.noRows")));
    } else {
      for (const entry of entries) {
        tbody.append(
          entry.type === "group"
            ? scheduleGroupRowElement(entry.group, result.columns.length)
            : scheduleRowElement(entry.row, result.columns),
        );
      }
    }
    table.append(thead, tbody);
    if (result.totals.length) {
      const tfoot = el("tfoot");
      tfoot.append(scheduleTotalRow(result.totals, result.columns));
      table.append(tfoot);
    }
    body.append(table);
    if (result.invalidFields.length) {
      body.append(el("p", "form-warning", t("schedules.invalidWarning")));
    }
  };

  return { element, update };
}
