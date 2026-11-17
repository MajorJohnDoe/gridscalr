import { importScheduleCsvFlow, isSummaryOpen, setSummaryOpen } from "../features/schedules";
import { store } from "../state/store";
import { setInspectorCollapsed } from "../ui/sidebar";

/**
 * View → Takeoff and Ctrl+Alt+S. The panel lives in the right dock, so
 * opening it also expands the inspector. One repaint follows the change; no
 * project data is touched.
 */
export function toggleSummaryFlow(refresh: () => void): void {
  if (!store.project) return;
  const open = !isSummaryOpen();
  setSummaryOpen(open);
  if (open) setInspectorCollapsed(false);
  refresh();
}

/** Returns true when the event was the Takeoff shortcut. */
export function summaryShortcut(event: KeyboardEvent, refresh: () => void): boolean {
  if (!event.altKey || event.code !== "KeyS") return false;
  event.preventDefault();
  toggleSummaryFlow(refresh);
  return true;
}

/** Opens the takeoff table CSV import flow and repaints the Takeoff panel after an apply. */
export function importScheduleCsv(scheduleId: string, refresh: () => void): void {
  void importScheduleCsvFlow(scheduleId, { refresh });
}
