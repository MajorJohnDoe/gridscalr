import { store } from "../state/store";

/** The window title follows the open project; kept out of App.ts wiring. */
export function updateWindowTitle(): void {
  document.title = store.project ? `GridScalr — ${store.project.name}` : "GridScalr";
}
