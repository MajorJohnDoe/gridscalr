import { el, option } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import { t, type MessageKey } from "../../../i18n";
import { MEASUREMENT_ITEM_KINDS } from "../../../model/layers";
import { pageDisplayName, pageNumber } from "../../../model/pages";
import { countTypeLabel } from "../../../model/countTypes";
import type { ScheduleCustomFilterOp, ScheduleFilter } from "../../../model/types";
import { valueControl } from "../../fields";
import { scheduleDraftProblems, scheduleFieldsForSource } from "../model";
import type { BuilderContext } from "./builderContext";
import { scheduleProblemText } from "./messages";

/**
 * Filter editor. Page, category, count type, space and item kind are
 * multi-selects; a custom field filter uses the typed field control so an
 * invalid number, date or option is reported inline and never stored. Filters
 * that do not apply to the space source stay visible and are named as
 * inapplicable rather than silently dropped.
 */

const FILTER_OPS: readonly ScheduleCustomFilterOp[] = ["eq", "contains", "empty", "notEmpty"];

function removeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", "icon-btn schedules-builder-action");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon("trash", 14);
  button.addEventListener("click", onClick);
  return button;
}

function multiSelect(
  label: string,
  options: { value: string; label: string }[],
  selected: readonly string[],
  onChange: (values: string[]) => void,
): HTMLLabelElement {
  const field = el("label", "field schedules-builder-multifield");
  field.append(el("span", "field-label", label));
  const select = el("select", "select schedules-builder-multiselect");
  select.multiple = true;
  select.size = Math.min(4, Math.max(2, options.length));
  select.setAttribute("aria-label", label);
  for (const entry of options) {
    select.append(option(entry.value, entry.label, selected.includes(entry.value)));
  }
  select.addEventListener("change", () => {
    onChange([...select.selectedOptions].map((entry) => entry.value));
  });
  field.append(select);
  return field;
}

type ListKey = "pageIds" | "categoryIds" | "countTypes" | "spaceIds" | "itemKinds";

function setList(filter: ScheduleFilter, key: ListKey, values: string[]): void {
  const target = filter as Record<string, unknown>;
  if (values.length) target[key] = values;
  else delete target[key];
}

function pageOptions(ctx: BuilderContext): { value: string; label: string }[] {
  return ctx.project.pages.map((page) => ({
    value: page.id,
    label:
      pageDisplayName(ctx.project, page.id) ||
      t("schedules.pageOnly", { page: pageNumber(ctx.project, page.id) }),
  }));
}

function standardFilters(ctx: BuilderContext, section: HTMLElement): void {
  const { project, draft } = ctx;
  const filters = draft.filters;
  const isSpace = draft.source === "spaces";
  section.append(
    multiSelect(t("schedules.filter.page"), pageOptions(ctx), filters.pageIds ?? [], (values) => {
      setList(filters, "pageIds", values);
      ctx.refresh();
    }),
  );
  if (!isSpace) {
    section.append(
      multiSelect(
        t("schedules.filter.category"),
        project.categories.map((category) => ({ value: category.id, label: category.name })),
        filters.categoryIds ?? [],
        (values) => {
          setList(filters, "categoryIds", values);
          ctx.refresh();
        },
      ),
      multiSelect(
        t("schedules.filter.countType"),
        project.countTypes.map((type) => ({
          value: type.id,
          label: countTypeLabel(project, type.id),
        })),
        filters.countTypes ?? [],
        (values) => {
          setList(filters, "countTypes", values);
          ctx.refresh();
        },
      ),
      multiSelect(
        t("schedules.filter.itemKind"),
        MEASUREMENT_ITEM_KINDS.map((kind) => ({
          value: kind,
          label: t(`kind.${kind}` as MessageKey),
        })),
        filters.itemKinds ?? [],
        (values) => {
          setList(filters, "itemKinds", values);
          ctx.refresh();
        },
      ),
    );
  }
  section.append(
    multiSelect(
      t("schedules.filter.space"),
      project.spaces.map((space) => ({
        value: space.id,
        label: space.number ? `${space.number} ${space.name}` : space.name,
      })),
      filters.spaceIds ?? [],
      (values) => {
        setList(filters, "spaceIds", values);
        ctx.refresh();
      },
    ),
  );
}

function customFilters(ctx: BuilderContext, section: HTMLElement): void {
  const { project, draft } = ctx;
  const fields = scheduleFieldsForSource(project, draft.source).filter((field) => field.fieldId);
  const title = el("h4", "schedules-builder-subtitle", t("schedules.builder.customFilters"));
  section.append(title);
  if (!fields.length) {
    section.append(el("p", "settings-note", t("schedules.builder.noCustomFields")));
    return;
  }
  const filters = draft.filters.custom ?? [];
  filters.forEach((filter) => {
    const fieldInfo = fields.find((field) => field.fieldId === filter.fieldId);
    const field = fieldInfo
      ? project.fieldDefinitions.find((entry) => entry.id === filter.fieldId)
      : undefined;
    const row = el("div", "schedules-builder-custom-filter");
    const fieldSelect = el("select", "select schedules-builder-field");
    fieldSelect.setAttribute("aria-label", t("schedules.builder.customField"));
    if (!fieldInfo) {
      fieldSelect.append(
        option(filter.fieldId, t("schedules.invalidField", { field: filter.fieldId }), true),
      );
    }
    for (const entry of fields) {
      fieldSelect.append(
        option(entry.fieldId ?? "", entry.label, entry.fieldId === filter.fieldId),
      );
    }
    fieldSelect.value = filter.fieldId;
    fieldSelect.addEventListener("change", () => {
      filter.fieldId = fieldSelect.value;
      delete filter.value;
      ctx.rebuild();
    });

    const op = el("select", "select schedules-builder-op");
    op.setAttribute("aria-label", t("schedules.builder.customOp"));
    for (const entry of FILTER_OPS) {
      op.append(option(entry, t(`schedules.customOp.${entry}` as MessageKey), entry === filter.op));
    }
    op.value = filter.op;
    op.addEventListener("change", () => {
      filter.op = op.value as ScheduleCustomFilterOp;
      if (filter.op === "empty" || filter.op === "notEmpty") delete filter.value;
      ctx.rebuild();
    });
    row.append(fieldSelect, op);

    if (field && filter.op === "eq") {
      row.append(
        valueControl({
          field,
          value: filter.value,
          label: t("schedules.builder.customValue", { field: field.label }),
          onChange: (value) => {
            if (value === undefined) delete filter.value;
            else filter.value = value;
            ctx.refresh();
          },
        }),
      );
    } else if (filter.op === "contains") {
      const input = el("input", "input schedules-builder-contains");
      input.type = "text";
      input.value = typeof filter.value === "string" ? filter.value : "";
      input.setAttribute(
        "aria-label",
        t("schedules.builder.customValue", { field: field?.label ?? "" }),
      );
      input.addEventListener("input", () => {
        if (input.value) filter.value = input.value;
        else delete filter.value;
        ctx.refresh();
      });
      row.append(input);
    }
    row.append(
      removeButton(t("schedules.builder.removeFilter"), () => {
        draft.filters.custom = filters.filter((entry) => entry !== filter);
        if (!draft.filters.custom.length) delete draft.filters.custom;
        ctx.rebuild();
      }),
    );
    section.append(row);
  });
  const add = el("button", "btn btn-small btn-ghost", t("schedules.builder.addFilter"));
  add.type = "button";
  add.addEventListener("click", () => {
    const first = fields[0];
    draft.filters.custom = [
      ...(draft.filters.custom ?? []),
      { fieldId: first.fieldId ?? "", op: "eq" },
    ];
    ctx.rebuild();
  });
  section.append(add);
}

export function filtersSection(ctx: BuilderContext): HTMLElement {
  const section = el("section", "schedules-builder-section schedules-builder-filters");
  const head = el("div", "schedules-builder-section-head");
  head.append(el("h3", "schedules-builder-title", t("schedules.builder.filters")));
  section.append(head);
  standardFilters(ctx, section);
  customFilters(ctx, section);
  const problems = scheduleDraftProblems(ctx.project, ctx.draft).filter(
    (problem) =>
      problem.code === "invalidFilter" ||
      problem.code === "inapplicableFilter" ||
      problem.code === "invalidCustomValue",
  );
  for (const problem of problems) {
    const field = problem.fieldId
      ? ctx.project.fieldDefinitions.find((entry) => entry.id === problem.fieldId)?.label
      : undefined;
    section.append(
      el("p", "form-warning", scheduleProblemText(problem, { filter: problem.ref, field })),
    );
  }
  return section;
}
