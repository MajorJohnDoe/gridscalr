import { HELP_CONTENT, type HelpTopic } from "../help/content";
import { renderMarkdown } from "../help/markdown";
import { showModal } from "./dialogs";
import { el } from "./dom";
import { brandMark, icon } from "./icons";

const TOPICS: Array<{ id: HelpTopic; label: string; icon: string }> = [
  { id: "guide", label: "User guide", icon: "file" },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: "keyboard" },
  { id: "about", label: "About", icon: "info" },
];

export function openHelp(topic: HelpTopic = "guide"): void {
  const body = el("div", "help-dialog");
  const tabs = el("div", "help-tabs");
  tabs.setAttribute("role", "tablist");
  const content = el("div", "help-content");
  content.setAttribute("tabindex", "0");
  const tabButtons = new Map<HelpTopic, HTMLButtonElement>();
  let active: HelpTopic = topic;

  const render = (next: HelpTopic) => {
    active = next;
    for (const [id, button] of tabButtons) {
      const selected = id === next;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    }
    if (next === "about") {
      content.replaceChildren(aboutPane());
    } else {
      content.innerHTML = renderMarkdown(HELP_CONTENT[next]);
    }
    content.scrollTop = 0;
  };

  for (const entry of TOPICS) {
    const button = el("button", "help-tab");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.innerHTML = `${icon(entry.icon, 14)}<span>${entry.label}</span>`;
    button.addEventListener("click", () => render(entry.id));
    tabs.append(button);
    tabButtons.set(entry.id, button);
  }

  content.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (href.endsWith(".md")) {
      render("shortcuts");
      return;
    }
    if (href.startsWith("#")) {
      const heading = content.querySelector<HTMLElement>(href);
      heading?.scrollIntoView({ block: "start" });
    }
  });

  body.append(tabs, content);
  render(active);

  void showModal({
    title: "Help",
    subtitle: "GridScalr on this computer",
    body,
    wide: true,
    className: "modal-help",
    actions: [{ label: "Close", value: "close", primary: true }],
  });
}

function aboutPane(): HTMLElement {
  const wrap = el("div", "help-about");
  const brand = el("div", "help-about-brand");
  brand.innerHTML = brandMark();
  const names = el("div");
  const title = el("h1", "", "GridScalr");
  const version = el("span", "help-version", `v${__APP_VERSION__}`);
  names.append(title, version);
  brand.append(names);

  const intro = el(
    "p",
    "help-about-intro",
    "A local-first desktop app for measuring PDF and TIF drawings and producing procurement quantities.",
  );

  const facts = el("dl", "help-facts");
  for (const [label, value] of [
    ["Version", `v${__APP_VERSION__}`],
    ["Project format", "Schema v6"],
    ["Desktop shell", "Tauri 2 with Rust"],
    ["Frontend", "TypeScript, HTML5 Canvas and PDF.js"],
    ["Storage", "Local files only"],
  ]) {
    facts.append(el("dt", "", label), el("dd", "", value));
  }

  const note = el(
    "p",
    "help-about-note",
    "No account, cloud service, telemetry or network access is required. Drawings are read from your disk and are never uploaded.",
  );

  wrap.append(brand, intro, facts, note);
  return wrap;
}
