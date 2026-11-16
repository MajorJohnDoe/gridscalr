import { t } from "../../../i18n";
import { describeError } from "../../../io/platformError";
import { pickCsv, type PickedCsv } from "../../../io/platform";
import { store } from "../../../state/store";
import { messageDialog, showModal } from "../../../ui/dialogs";
import { el } from "../../../ui/dom";
import { toast } from "../../../ui/toast";
import { applyScheduleCsvImport, buildScheduleCsvImport } from "../csv";
import type { ScheduleCsvImportPlan } from "../csv";
import { blockedMessage, csvImportReport } from "./csvReport";

/**
 * The CSV import dialog. It shows a dry run first and writes only after the
 * explicit apply action. The apply step is one store mutation, so a multi-row
 * import is one undo step, and it only updates the rows the plan accepted.
 */

export interface ScheduleCsvHost {
  refresh?: () => void;
}

function blockedBody(plan: ScheduleCsvImportPlan): HTMLElement {
  const body = el("div", "form-stack schedules-csv-blocked");
  body.append(el("p", "form-warning", blockedMessage(plan)));
  body.append(el("p", "empty-note small", t("schedulesCsv.updatesOnly")));
  return body;
}

function applyLabel(count: number): string {
  return count ? t("schedulesCsv.apply", { count }) : t("schedulesCsv.applyNone");
}

export function openScheduleCsvImport(
  plan: ScheduleCsvImportPlan,
  host: ScheduleCsvHost = {},
): Promise<void> {
  const subtitle = plan.fileName || plan.scheduleName;
  if (plan.blocked) {
    return showModal({
      title: t("schedulesCsv.title"),
      subtitle: subtitle || undefined,
      body: blockedBody(plan),
      wide: false,
      className: "schedules-csv-modal",
      actions: [{ label: t("common.close"), value: "close", primary: true }],
    }).then(() => undefined);
  }
  const body = csvImportReport(plan);
  const revision = store.revision;
  return showModal({
    title: t("schedulesCsv.title"),
    subtitle: subtitle || undefined,
    body,
    wide: true,
    className: "schedules-csv-modal",
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: applyLabel(plan.changed.length), value: "apply", primary: true },
    ],
    onMount: (modal) => {
      const primary = modal.querySelector<HTMLButtonElement>(".modal-footer .btn-primary");
      if (primary) primary.disabled = plan.changed.length === 0;
    },
  }).then((value) => {
    if (value !== "apply" || plan.changed.length === 0) return;
    if (!store.project || store.readOnly) return;
    if (store.revision !== revision) {
      toast(t("schedulesCsv.projectChanged"), "warning");
      return;
    }
    let applied = 0;
    store.mutate((project) => {
      applied = applyScheduleCsvImport(project, plan).applied;
    }, "change");
    host.refresh?.();
    toast(
      applied ? t("schedulesCsv.applied", { count: applied }) : t("schedulesCsv.appliedNone"),
      applied ? "success" : "warning",
    );
  });
}

/**
 * Picks a CSV file, builds the dry run and opens the dialog. A picker error,
 * including the 10 MB size guard, is reported before a row is parsed.
 */
export async function importScheduleCsvFlow(
  scheduleId: string,
  host: ScheduleCsvHost = {},
): Promise<void> {
  if (!store.project || store.readOnly) return;
  let picked: PickedCsv | null;
  try {
    picked = await pickCsv();
  } catch (error) {
    await messageDialog(t("schedulesCsv.importFailedTitle"), describeError(error), "warning");
    return;
  }
  if (!picked) return;
  const project = store.project;
  if (!project) return;
  const plan = buildScheduleCsvImport(picked.bytes, {
    project,
    scheduleId,
    fileName: picked.name,
  });
  await openScheduleCsvImport(plan, host);
}
