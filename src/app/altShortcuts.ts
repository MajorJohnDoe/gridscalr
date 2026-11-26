/** Ctrl/Cmd+Alt shortcuts that open a project window. */
export interface AltShortcutActions {
  openQuantities: () => void;
  openSpaces: () => void;
}

export function altShortcut(event: KeyboardEvent, actions: AltShortcutActions): boolean {
  if (!event.altKey) return false;
  if (event.code === "KeyQ") {
    event.preventDefault();
    actions.openQuantities();
    return true;
  }
  if (event.code === "KeyR") {
    event.preventDefault();
    actions.openSpaces();
    return true;
  }
  return false;
}
