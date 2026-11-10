import { t } from "../../i18n";

const INSTANCE_KEY = "gridscalr.instance.v1";

let cachedInstance: string | null = null;

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Identity of this app window for the lifetime of the browser session. It is
 * stored in sessionStorage so a reload keeps the same lease, while two windows
 * normally receive different IDs.
 */
export function instanceId(): string {
  if (cachedInstance) return cachedInstance;
  try {
    const stored = sessionStorage.getItem(INSTANCE_KEY);
    if (stored) {
      cachedInstance = stored;
      return stored;
    }
    const created = randomId();
    sessionStorage.setItem(INSTANCE_KEY, created);
    cachedInstance = created;
    return created;
  } catch {
    cachedInstance = randomId();
    return cachedInstance;
  }
}

/** A coarse, non-personal machine label: desktop or browser plus the OS family. */
export function hostLabel(desktop: boolean): string {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  let platform = "Linux";
  if (/macintosh|mac os x/i.test(userAgent)) platform = "macOS";
  else if (/windows/i.test(userAgent)) platform = "Windows";
  return desktop
    ? t("sessionRecovery.host.desktop", { platform })
    : t("sessionRecovery.host.browser", { platform });
}

export function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
}
