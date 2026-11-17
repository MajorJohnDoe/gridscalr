/**
 * Public surface of the Takeoff settings hub. One modal owns the Objects,
 * Fields, Tables and Cards tabs; the shell imports only this index.
 */
export { openTakeoffSettingsDialog } from "./ui/dialog";
export { TAKEOFF_SETTINGS_TABS, TAKEOFF_CARD_IDS, isTakeoffSettingsTab } from "./model";
export type { TakeoffSettingsTab, TakeoffSettingsTarget } from "./model";
