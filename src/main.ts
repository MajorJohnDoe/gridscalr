import "./styles.css";
import "./styles/help.css";
import "./styles/popovers.css";
import { App } from "./app/App";
import { store } from "./state/store";

const root = document.getElementById("app");

if (!root) {
  throw new Error("The application root element is missing.");
}

let appStarted = false;

function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n\n${error.stack ?? ""}`.trim();
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function showStartupError(error: unknown): void {
  if (!root) return;
  console.error("GridScalr failed to start", error);

  const fallback = document.createElement("div");
  fallback.className = "boot-fallback";

  const card = document.createElement("div");
  card.className = "boot-card";

  const brand = document.createElement("div");
  brand.className = "boot-brand";
  brand.innerHTML = "Grid<span>Scalr</span>";

  const status = document.createElement("p");
  status.className = "boot-status";
  status.textContent = "The interface failed to start.";

  const hint = document.createElement("p");
  hint.className = "boot-hint";
  hint.textContent =
    "Restart the app and make sure Microsoft Edge WebView2 is up to date. The technical details below can be copied into a bug report.";

  const detail = document.createElement("pre");
  detail.className = "boot-error";
  detail.style.userSelect = "text";
  detail.textContent = `${formatStartupError(error)}\n\nWebView: ${navigator.userAgent}`;

  card.append(brand, status, hint, detail);
  fallback.append(card);
  root.replaceChildren(fallback);
}

window.addEventListener("error", (event) => {
  if (!appStarted) showStartupError(event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  if (!appStarted) showStartupError(event.reason);
});

try {
  const app = new App(root);
  appStarted = true;
  if (import.meta.env.DEV) {
    (
      window as Window & {
        __gridscalr?: {
          store: typeof store;
          app: App;
          canvas: ReturnType<App["getCanvasTestApi"]>;
        };
      }
    ).__gridscalr = {
      store,
      app,
      canvas: app.getCanvasTestApi(),
    };
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(() => app.dispose());
  }
} catch (error) {
  showStartupError(error);
}
