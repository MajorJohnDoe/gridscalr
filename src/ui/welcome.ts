import { getRecent } from "../io/platform";
import { store } from "../state/store";
import { clear, el } from "./dom";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";

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
  brand.innerHTML = `${icon("grid", 42)}`;
  brand.firstElementChild?.classList.add("brand-mark");
  const title = el("h1", "welcome-title", "GridScalr");
  brand.append(title);
  card.append(brand);
  card.append(
    el(
      "p",
      "welcome-subtitle",
      "Open architectural or engineering drawings as PDF or scanned TIF, calibrate the scale, and measure lengths and areas. Add several sheets to one project. Everything stays on your device.",
    ),
  );
  const actionsWrap = el("div", "welcome-actions");
  const open = el("button", "btn btn-primary", "Open drawing");
  open.type = "button";
  open.innerHTML = `${icon("folder", 16)}<span>Open drawing</span>`;
  open.addEventListener("click", actions.openPdf);
  const openProject = el("button", "btn", "Open project");
  openProject.type = "button";
  openProject.innerHTML = `${icon("file", 15)}<span>Open project</span>`;
  openProject.addEventListener("click", actions.openProject);
  actionsWrap.append(open, openProject);

  const autosave = actions.getAutosave();
  if (autosave) {
    const restore = el("button", "btn", "Restore last session");
    restore.type = "button";
    restore.innerHTML = `${icon("undo", 15)}<span>Restore last session</span>`;
    restore.title = `Autosaved ${new Date(autosave.savedAt).toLocaleString()}`;
    restore.addEventListener("click", actions.restoreAutosave);
    actionsWrap.append(restore);
  }
  card.append(actionsWrap);

  const recent = getRecent();
  if (recent.length) {
    const recents = el("div", "welcome-recents");
    recents.append(el("h3", "", "Recent"));
    const list = el("div", "recent-list");
    for (const entry of recent.slice(0, 10)) {
      const row = el("button", "recent-item");
      row.type = "button";
      row.innerHTML = icon(entry.kind === "pdf" ? "file" : "layers", 15);
      row.append(el("span", "recent-name", entry.name));
      row.append(el("span", "recent-meta", entry.kind === "pdf" ? "PDF" : "Project"));
      row.addEventListener("click", () => actions.openRecent(entry));
      list.append(row);
    }
    recents.append(list);
    card.append(recents);
  }

  const note = el("p", "welcome-footnote");
  note.innerHTML = `${icon("lock", 14)}<span>Local-first. Drawings are read from your disk and never uploaded.</span>`;
  card.append(note);
  refs.welcome.append(card);
}
