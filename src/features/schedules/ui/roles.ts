import { el, option } from "../../../ui/dom";
import { showModal } from "../../../ui/dialogs";
import { t, type MessageKey } from "../../../i18n";
import { store } from "../../../state/store";
import { CATEGORY_SUMMARY_ROLES, COUNT_SUMMARY_ROLES } from "../../../model/summary";
import { countTypeLabel } from "../../../model/countTypes";
import type { CategorySummaryRole, CountSummaryRole } from "../../../model/types";
import { setCategorySummaryRole, setCountTypeSummaryRole } from "../model";

/**
 * Summary-role configuration. A wall card reads categories whose role is
 * `wall`; a door card reads count types whose role is `door`. Roles are never
 * inferred, so this dialog is the Configure action the cards offer. Each
 * change is one undo step.
 */

export type SummaryRoleFocus = "walls" | "doors";

function roleSelect<T extends string>(
  label: string,
  roles: readonly T[],
  value: T | undefined,
  prefix: string,
  onChange: (role: T | undefined) => void,
): HTMLSelectElement {
  const select = el("select", "select schedules-role-select");
  select.setAttribute("aria-label", label);
  select.append(option("", t("schedules.roles.none"), value === undefined));
  for (const role of roles) {
    select.append(option(role, t(`${prefix}.${role}` as MessageKey), role === value));
  }
  select.value = value ?? "";
  select.addEventListener("change", () => {
    onChange(select.value ? (select.value as T) : undefined);
  });
  return select;
}

export function openSummaryRolesDialog(focus: SummaryRoleFocus = "walls"): Promise<void> {
  const project = store.project;
  if (!project) return Promise.resolve();
  const body = el("div", "form-stack schedules-roles");
  body.append(el("p", "modal-message", t("schedules.roles.intro")));

  const walls = el("section", "schedules-roles-section");
  walls.append(el("h3", "schedules-builder-title", t("schedules.roles.walls")));
  for (const category of project.categories) {
    const row = el("label", "schedules-role-row");
    row.append(el("span", "schedules-role-label", category.name));
    row.append(
      roleSelect<CategorySummaryRole>(
        t("schedules.roles.categoryAria", { name: category.name }),
        CATEGORY_SUMMARY_ROLES,
        category.summaryRole,
        "schedules.role.category",
        (role) => {
          store.mutate((current) => {
            setCategorySummaryRole(current, category.id, role);
          }, "change");
        },
      ),
    );
    walls.append(row);
  }

  const doors = el("section", "schedules-roles-section");
  doors.append(el("h3", "schedules-builder-title", t("schedules.roles.doors")));
  for (const type of project.countTypes) {
    const name = countTypeLabel(project, type.id);
    const row = el("label", "schedules-role-row");
    row.append(el("span", "schedules-role-label", name));
    row.append(
      roleSelect<CountSummaryRole>(
        t("schedules.roles.countAria", { name }),
        COUNT_SUMMARY_ROLES,
        type.summaryRole,
        "schedules.role.count",
        (role) => {
          store.mutate((current) => {
            setCountTypeSummaryRole(current, type.id, role);
          }, "change");
        },
      ),
    );
    doors.append(row);
  }

  body.append(walls, doors);
  return showModal({
    title: t("schedules.roles.title"),
    subtitle: t("schedules.roles.subtitle"),
    body,
    wide: true,
    actions: [{ label: t("common.close"), value: "close", primary: true }],
    onMount: () => {
      const section = focus === "doors" ? doors : walls;
      requestAnimationFrame(() => {
        section.querySelector<HTMLSelectElement>("select")?.focus();
      });
    },
  }).then(() => undefined);
}
