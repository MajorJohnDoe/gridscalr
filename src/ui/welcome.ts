import { getRecent, isTauri } from "../io/platform";
import { store } from "../state/store";
import { clear, el } from "./dom";
import { brandMark, icon } from "./icons";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { t } from "../i18n";

const QUICK_START_STEPS = [
  "welcome.step.open",
  "welcome.step.calibrate",
  "welcome.step.measure",
] as const;

export function renderWelcome(refs: ShellRefs, actions: PanelActions): void {
  const show = !store.project;
  refs.welcome.classList.toggle("hidden", !show);
  if (!show) {
    refs.welcome.textContent = "";
    return;
  }
  clear(refs.welcome);
  const card = el("div", "welcome-card");
  const brand = el("div", "welcome-brand");
  brand.innerHTML = brandMark(42);
  const title = el("h1", "welcome-title", "GridScalr");
  brand.append(title);
  card.append(brand);
  card.append(el("p", "welcome-subtitle", t("welcome.subtitle")));

  const actionsWrap = el("div", "welcome-actions");
  const open = el("button", "btn btn-primary", t("welcome.openDrawing"));
  open.type = "button";
  open.innerHTML = `${icon("folder", 16)}<span>${t("welcome.openDrawing")}</span>`;
  open.addEventListener("click", actions.openPdf);
  const openProject = el("button", "btn", t("welcome.openProject"));
  openProject.type = "button";
  openProject.innerHTML = `${icon("file", 15)}<span>${t("welcome.openProject")}</span>`;
  openProject.addEventListener("click", actions.openProject);
  actionsWrap.append(open, openProject);

  if (isTauri) {
    const demo = el("button", "btn", t("welcome.demo"));
    demo.type = "button";
    demo.innerHTML = `${icon("layers", 15)}<span>${t("welcome.demo")}</span>`;
    demo.addEventListener("click", actions.openDemoProject);
    actionsWrap.append(demo);
  }

  const autosave = actions.getAutosave();
  if (autosave) {
    const restore = el("button", "btn", t("welcome.restore"));
    restore.type = "button";
    restore.innerHTML = `${icon("undo", 15)}<span>${t("welcome.restore")}</span>`;
    restore.title = t("welcome.autosavedAt", {
      time: new Date(autosave.savedAt).toLocaleString(),
    });
    restore.addEventListener("click", actions.restoreAutosave);
    actionsWrap.append(restore);
  }
  card.append(actionsWrap);

  const steps = el("div", "welcome-steps");
  steps.append(el("h3", "", t("welcome.quickStart")));
  const list = el("ol", "welcome-step-list");
  for (const key of QUICK_START_STEPS) list.append(el("li", "", t(key)));
  steps.append(list);
  card.append(steps);

  const recent = getRecent();
  if (recent.length) {
    const recents = el("div", "welcome-recents");
    recents.append(el("h3", "", t("welcome.recent")));
    const list = el("div", "recent-list");
    for (const entry of recent.slice(0, 10)) {
      const row = el("button", "recent-item");
      row.type = "button";
      row.innerHTML = icon(entry.kind === "pdf" ? "file" : "layers", 15);
      row.append(el("span", "recent-name", entry.name));
      row.append(
        el("span", "recent-meta", entry.kind === "pdf" ? "PDF" : t("menu.file.recentProject")),
      );
      row.addEventListener("click", () => actions.openRecent(entry));
      list.append(row);
    }
    recents.append(list);
    card.append(recents);
  }

  const note = el("p", "welcome-footnote");
  note.innerHTML = `${icon("lock", 14)}<span>${t("welcome.footnote")}</span>`;
  card.append(note);
  refs.welcome.append(card);
}
