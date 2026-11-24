import { formatShortcut } from "../shortcuts";

export interface ActionItem {
  kind: "action";
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  action: () => void;
}

export interface SeparatorItem {
  kind: "separator";
}

export interface SubmenuItem {
  kind: "submenu";
  label: string;
  key?: string;
  disabled?: boolean;
  items: MenuItem[];
}

export type MenuItem = ActionItem | SeparatorItem | SubmenuItem;

export interface MenuDefinition {
  id: string;
  label: string;
  items: () => MenuItem[];
}

export function action(
  label: string,
  run: () => void,
  options: { shortcut?: string; disabled?: boolean; checked?: boolean; danger?: boolean } = {},
): ActionItem {
  return {
    kind: "action",
    label,
    shortcut: options.shortcut ? formatShortcut(options.shortcut) : undefined,
    disabled: options.disabled,
    checked: options.checked,
    danger: options.danger,
    action: run,
  };
}

export function separator(): SeparatorItem {
  return { kind: "separator" };
}
