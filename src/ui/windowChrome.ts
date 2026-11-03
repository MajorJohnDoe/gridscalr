import { LANGUAGE_CHANGED_EVENT, t } from "../i18n";
import { isTauri } from "../io/platform";
import { el } from "./dom";
import { icon } from "./icons";
import { toast } from "./toast";

/** Where the app is running; drives the CSS that offsets the window chrome. */
export type Platform = "browser" | "windows" | "macos" | "linux";

/** The slice of the Tauri window API the chrome needs. */
interface DesktopWindow {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onResized: (handler: () => void) => Promise<() => void>;
}

export interface WindowChromeActions {
  /** Close the window through the app flow so unsaved changes are never discarded. */
  quit: () => void;
}

export interface WindowControls {
  element: HTMLElement;
  dispose: () => void;
}

function currentUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

export function detectPlatform(
  userAgent: string = currentUserAgent(),
  desktop: boolean = isTauri,
): Platform {
  if (!desktop) return "browser";
  if (/macintosh|mac os x/i.test(userAgent)) return "macos";
  if (/windows/i.test(userAgent)) return "windows";
  return "linux";
}

/** Publish the platform on the root element so CSS can adjust the title row. */
export function markPlatform(): Platform {
  const platform = detectPlatform();
  if (typeof document !== "undefined") {
    document.documentElement.dataset.platform = platform;
  }
  return platform;
}

export function restoreGlyph(isMaximized: boolean): "windowMaximize" | "windowRestore" {
  return isMaximized ? "windowRestore" : "windowMaximize";
}

async function desktopWindow(): Promise<DesktopWindow | null> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch {
    return null;
  }
}

function controlButton(glyph: string): HTMLButtonElement {
  const button = el("button", "window-control-btn");
  button.type = "button";
  button.innerHTML = icon(glyph, 10);
  return button;
}

function setLabel(button: HTMLButtonElement, label: string): void {
  button.title = label;
  button.setAttribute("aria-label", label);
}

/**
 * Draw minimize, maximize/restore and close into the title row.
 *
 * macOS keeps its native traffic lights through the overlay title bar, and the
 * browser fallback has no window to control, so both return `null`. The close
 * button deliberately routes through {@link WindowChromeActions.quit} so the
 * unsaved-changes prompt still runs.
 */
export function mountWindowControls(
  host: HTMLElement,
  actions: WindowChromeActions,
): WindowControls | null {
  const platform = markPlatform();
  if (!isTauri || platform === "macos") return null;

  const group = el("div", "window-controls");
  group.setAttribute("role", "group");

  const minimizeBtn = controlButton("windowMinimize");
  const maximizeBtn = controlButton("windowMaximize");
  const closeBtn = controlButton("close");
  closeBtn.classList.add("is-close");

  let disposed = false;
  let frame = 0;
  let unlisten: (() => void) | null = null;
  let maximized = false;

  const updateLabels = (): void => {
    group.setAttribute("aria-label", t("window.controls"));
    setLabel(minimizeBtn, t("window.minimize"));
    setLabel(maximizeBtn, maximized ? t("window.restore") : t("window.maximize"));
    setLabel(closeBtn, t("window.close"));
  };

  const applyMaximized = (next: boolean): void => {
    maximized = next;
    maximizeBtn.innerHTML = icon(restoreGlyph(maximized), 10);
    updateLabels();
  };

  updateLabels();
  window.addEventListener(LANGUAGE_CHANGED_EVENT, updateLabels);

  const act = async (
    run: (win: DesktopWindow) => Promise<void>,
    failure: string,
  ): Promise<void> => {
    const win = await desktopWindow();
    if (!win) return;
    try {
      await run(win);
    } catch {
      if (failure) toast(failure, "warning");
    }
  };

  const syncMaximized = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      void act(async (win) => applyMaximized(await win.isMaximized()), "");
    });
  };

  minimizeBtn.addEventListener("click", () => {
    void act((win) => win.minimize(), "The window could not be minimized.");
  });
  maximizeBtn.addEventListener("click", () => {
    void act(async (win) => {
      await win.toggleMaximize();
      applyMaximized(await win.isMaximized());
    }, "The window could not be resized.");
  });
  closeBtn.addEventListener("click", () => actions.quit());

  void (async () => {
    const win = await desktopWindow();
    if (!win || disposed) return;
    try {
      applyMaximized(await win.isMaximized());
      unlisten = await win.onResized(syncMaximized);
    } catch {
      // The buttons keep working; only the maximize glyph would stay stale.
    }
  })();

  group.append(minimizeBtn, maximizeBtn, closeBtn);
  host.append(group);

  return {
    element: group,
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      unlisten?.();
      unlisten = null;
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, updateLabels);
      group.remove();
    },
  };
}
