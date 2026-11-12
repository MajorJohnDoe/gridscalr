import { getRecent, isTauri, pathExists } from "../io/platform";
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
  const project = store.project;
  const emptyProject = Boolean(project && project.pages.length === 0);
  const show = !project || emptyProject;
  refs.welcome.classList.toggle("hidden", !show);
  if (!show) {
    refs.welcome.textContent = "";
    return;
  }
  clear(refs.welcome);
  if (emptyProject && project) {
    const emptyCard = el("div", "welcome-card empty-project-card");
    const brand = el("div", "welcome-brand");
    brand.innerHTML = brandMark(42);
    brand.append(el("h1", "welcome-title", project.name));
    emptyCard.append(brand);
    emptyCard.append(el("p", "welcome-subtitle", t("welcome.emptyProject")));
    const emptyActions = el("div", "welcome-actions");
    const addPages = el("button", "btn btn-primary", t("page.addPages"));
    addPages.type = "button";
    addPages.addEventListener("click", actions.addPages);
    const importPages = el("button", "btn", t("page.importProjectPages"));
    importPages.type = "button";
    importPages.addEventListener("click", actions.importProjectPages);
    emptyActions.append(addPages, importPages);
    emptyCard.append(emptyActions);
    refs.welcome.append(emptyCard);
    return;
  }
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
  const newProject = el("button", "btn", t("menu.file.newProject"));
  newProject.type = "button";
  newProject.innerHTML = `${icon("plus", 15)}<span>${t("menu.file.newProject")}</span>`;
  newProject.addEventListener("click", actions.newProject);
  actionsWrap.append(open, openProject, newProject);

  if (isTauri) {
    const demo = el("button", "btn", t("welcome.demo"));
    demo.type = "button";
    demo.innerHTML = `${icon("layers", 15)}<span>${t("welcome.demo")}</span>`;
    demo.addEventListener("click", actions.openDemoProject);
    actionsWrap.append(demo);
  }

  const recovery = actions.getRecoverySummary();
  if (recovery.count || recovery.checkpoints) {
    const restore = el("button", "btn", t("welcome.restore"));
    restore.type = "button";
    restore.innerHTML = `${icon("undo", 15)}<span>${t("welcome.restore")}</span>`;
    restore.title = recovery.latest
      ? t("welcome.autosavedAt", {
          time: new Date(recovery.latest.savedAt).toLocaleString(),
        })
      : t("sessionRecovery.title");
    restore.addEventListener("click", actions.openRecovery);
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
      const meta = el(
        "span",
        "recent-meta",
        entry.kind === "pdf" ? "PDF" : t("menu.file.recentProject"),
      );
      row.append(meta);
      row.addEventListener("click", () => actions.openRecent(entry));
      list.append(row);
      if (isTauri) {
        void pathExists(entry.path).then((exists) => {
          if (exists || !meta.isConnected) return;
          row.disabled = true;
          row.title = t("welcome.recentMissingTitle", { path: entry.path });
          meta.textContent = t("welcome.recentMissing");
        });
      }
    }
    recents.append(list);
    card.append(recents);
  } else {
    card.append(el("p", "welcome-empty settings-note", t("welcome.recentEmpty")));
  }

  const note = el("p", "welcome-footnote");
  note.innerHTML = `${icon("lock", 14)}<span>${t("welcome.footnote")}</span>`;
  card.append(note);
  refs.welcome.append(card);
}
