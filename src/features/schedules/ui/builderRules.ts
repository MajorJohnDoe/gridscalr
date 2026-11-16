import { el, option } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import { t, type MessageKey } from "../../../i18n";
import type { ScheduleFieldRef, ScheduleTotalOp } from "../../../model/types";
import { scheduleFieldsForSource } from "../model";
import type { BuilderContext } from "./builderContext";

/**
 * Group by, sort and totals. Every field picker lists the whole catalogue for
 * the source and keeps an unresolved stored reference visible as "Unknown
 * field", so a broken definition can be repaired instead of hidden.
 */

const TOTAL_OPS: readonly ScheduleTotalOp[] = ["sum", "count", "avg", "min", "max"];

function fieldSelect(
  ctx: BuilderContext,
  value: ScheduleFieldRef,
  label: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = el("select", "select schedules-builder-field");
  select.setAttribute("aria-label", label);
  const fields = scheduleFieldsForSource(ctx.project, ctx.draft.source);
  if (value && !fields.some((field) => field.ref === value)) {
    select.append(option(value, t("schedules.invalidField", { field: value }), true));
  }
  for (const field of fields) {
    select.append(option(field.ref, field.label, field.ref === value));
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function removeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", "icon-btn schedules-builder-action");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon("trash", 14);
  button.addEventListener("click", onClick);
  return button;
}

function groupBySection(ctx: BuilderContext, wrap: HTMLElement): void {
  const { draft } = ctx;
  const field = el("label", "field");
  field.append(el("span", "field-label", t("schedules.builder.groupBy")));
  const select = fieldSelect(ctx, draft.groupBy ?? "", t("schedules.builder.groupBy"), (value) => {
    if (value) draft.groupBy = value;
    else delete draft.groupBy;
    ctx.refresh();
  });
  select.prepend(option("", t("schedules.builder.noGrouping"), !draft.groupBy));
  field.append(select);
  wrap.append(field);
}

function sortSection(ctx: BuilderContext, wrap: HTMLElement): void {
  const { draft } = ctx;
  const title = el("h4", "schedules-builder-subtitle", t("schedules.builder.sort"));
  wrap.append(title);
  draft.sort.forEach((sort, index) => {
    const row = el("div", "schedules-builder-rule");
    row.append(
      fieldSelect(ctx, sort.field, t("schedules.builder.sortField"), (value) => {
        sort.field = value;
        ctx.refresh();
      }),
    );
    const direction = el("select", "select schedules-builder-direction");
    direction.setAttribute("aria-label", t("schedules.builder.sortDirection"));
    direction.append(
      option("asc", t("schedules.builder.asc"), sort.direction === "asc"),
      option("desc", t("schedules.builder.desc"), sort.direction === "desc"),
    );
    direction.addEventListener("change", () => {
      sort.direction = direction.value === "desc" ? "desc" : "asc";
      ctx.refresh();
    });
    row.append(direction);
    row.append(
      removeButton(t("schedules.builder.removeSort"), () => {
        draft.sort.splice(index, 1);
        ctx.rebuild();
      }),
    );
    wrap.append(row);
  });
  const add = el("button", "btn btn-small btn-ghost", t("schedules.builder.addSort"));
  add.type = "button";
  add.addEventListener("click", () => {
    const first = scheduleFieldsForSource(ctx.project, draft.source)[0];
    draft.sort.push({ field: first?.ref ?? "label", direction: "asc" });
    ctx.rebuild();
  });
  wrap.append(add);
}

function totalOpLabel(op: ScheduleTotalOp): string {
  return t(`schedules.totalOp.${op}` as MessageKey);
}

function totalsSection(ctx: BuilderContext, wrap: HTMLElement): void {
  const { draft } = ctx;
  const title = el("h4", "schedules-builder-subtitle", t("schedules.builder.totals"));
  wrap.append(title);
  draft.totals.forEach((total, index) => {
    const row = el("div", "schedules-builder-rule");
    row.append(
      fieldSelect(ctx, total.field, t("schedules.builder.totalField"), (value) => {
        total.field = value;
        ctx.refresh();
      }),
    );
    const op = el("select", "select schedules-builder-op");
    op.setAttribute("aria-label", t("schedules.builder.totalOp"));
    for (const entry of TOTAL_OPS) {
      op.append(option(entry, totalOpLabel(entry), entry === total.op));
    }
    op.value = total.op;
    op.addEventListener("change", () => {
      total.op = op.value as ScheduleTotalOp;
      ctx.refresh();
    });
    row.append(op);
    row.append(
      removeButton(t("schedules.builder.removeTotal"), () => {
        draft.totals.splice(index, 1);
        ctx.rebuild();
      }),
    );
    wrap.append(row);
  });
  const add = el("button", "btn btn-small btn-ghost", t("schedules.builder.addTotal"));
  add.type = "button";
  add.addEventListener("click", () => {
    const fields = scheduleFieldsForSource(ctx.project, draft.source);
    const numeric = fields.find((field) => field.numeric) ?? fields[0];
    draft.totals.push({ field: numeric?.ref ?? "value", op: "sum" });
    ctx.rebuild();
  });
  wrap.append(add);
}

export function rulesSection(ctx: BuilderContext): HTMLElement {
  const section = el("section", "schedules-builder-section");
  const head = el("div", "schedules-builder-section-head");
  head.append(el("h3", "schedules-builder-title", t("schedules.builder.rules")));
  section.append(head);
  groupBySection(ctx, section);
  sortSection(ctx, section);
  totalsSection(ctx, section);
  return section;
}
