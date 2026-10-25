import { HELP_CONTENT, type HelpTopic } from "../help/content";
import { resolveHelpImage } from "../help/images";
import { renderMarkdown } from "../help/markdown";
import { SCHEMA_VERSION } from "../model/types";
import { showModal } from "./dialogs";
import { el } from "./dom";
import { brandMark, icon } from "./icons";

const TOPICS: Array<{ id: HelpTopic; label: string; icon: string }> = [
  { id: "workflows", label: "Workflows", icon: "markups" },
  { id: "guide", label: "User guide", icon: "file" },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: "keyboard" },
  { id: "about", label: "About", icon: "info" },
];

const DOC_TOPICS: Record<string, Exclude<HelpTopic, "about">> = {
  "workflows.md": "workflows",
  "user-guide.md": "guide",
  "shortcuts.md": "shortcuts",
};

interface HelpSection {
  id: string;
  label: string;
  level: number;
  element: HTMLElement;
}

export function openHelp(topic: HelpTopic = "guide"): void {
  const body = el("div", "help-dialog");
  const tabs = el("div", "help-tabs");
  tabs.setAttribute("role", "tablist");
  const layout = el("div", "help-layout");
  const sidebar = el("aside", "help-sidebar");
  const search = el("input", "input help-search");
  search.type = "search";
  search.placeholder = "Search this topic…";
  search.setAttribute("aria-label", "Search help");
  const toc = el("nav", "help-toc");
  toc.setAttribute("aria-label", "On this page");
  const searchResults = el("div", "help-search-results");
  searchResults.hidden = true;
  sidebar.append(search, toc, searchResults);
  const content = el("div", "help-content");
  content.setAttribute("tabindex", "0");
  layout.append(sidebar, content);
  const tabButtons = new Map<HelpTopic, HTMLButtonElement>();
  let active: HelpTopic = topic;
  let sections: HelpSection[] = [];

  const scrollTo = (element: HTMLElement) => {
    element.scrollIntoView({ block: "start" });
    content.focus({ preventScroll: true });
  };

  const setActiveSection = (id: string) => {
    for (const link of toc.querySelectorAll<HTMLElement>("[data-section]")) {
      link.classList.toggle("is-active", link.dataset.section === id);
    }
  };

  const collectBlocks = (markdown: HTMLElement) => {
    const headings = [...markdown.querySelectorAll<HTMLElement>("h1, h2, h3")];
    const blocks = [...markdown.querySelectorAll<HTMLElement>("p, li, blockquote, pre, tr")];
    return { headings, blocks };
  };

  const headingFor = (element: HTMLElement, headings: HTMLElement[]): HTMLElement | null => {
    let current: HTMLElement | null = headings[0] ?? null;
    for (const heading of headings) {
      if (heading === element) return heading;
      if (heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
        current = heading;
      } else {
        break;
      }
    }
    return current;
  };

  const buildToc = (markdown: HTMLElement) => {
    sections = [...markdown.querySelectorAll<HTMLElement>("h2, h3")]
      .filter((heading) => heading.id)
      .map((heading) => ({
        id: heading.id,
        label: heading.textContent?.trim() ?? "",
        level: Number(heading.tagName.slice(1)),
        element: heading,
      }));
    toc.replaceChildren();
    for (const section of sections) {
      const button = el(
        "button",
        `help-toc-link${section.level === 3 ? " is-sub" : ""}`,
        section.label,
      );
      button.type = "button";
      button.dataset.section = section.id;
      button.addEventListener("click", () => {
        setActiveSection(section.id);
        scrollTo(section.element);
      });
      toc.append(button);
    }
    toc.hidden = sections.length === 0;
    setActiveSection(sections[0]?.id ?? "");
  };

  const runSearch = () => {
    const query = search.value.trim().toLowerCase();
    if (!query) {
      searchResults.hidden = true;
      searchResults.replaceChildren();
      toc.hidden = sections.length === 0;
      return;
    }
    toc.hidden = true;
    searchResults.hidden = false;
    const markdown = content.querySelector<HTMLElement>(".markdown");
    if (!markdown) return;
    const { headings, blocks } = collectBlocks(markdown);
    const results = new Map<string, { heading: HTMLElement; snippet: string; element: HTMLElement }>();

    for (const heading of headings) {
      const text = heading.textContent?.trim() ?? "";
      if (!text.toLowerCase().includes(query)) continue;
      const key = heading.id || text;
      results.set(key, { heading, snippet: "", element: heading });
    }
    for (const block of blocks) {
      const text = block.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!text || !text.toLowerCase().includes(query)) continue;
      const heading = headingFor(block, headings);
      if (!heading) continue;
      const key = heading.id || heading.textContent?.trim() || text;
      if (!results.has(key)) {
        const index = text.toLowerCase().indexOf(query);
        const start = Math.max(0, index - 45);
        const snippet = `${start > 0 ? "…" : ""}${text.slice(start, start + 150)}${
          start + 150 < text.length ? "…" : ""
        }`;
        results.set(key, { heading, snippet, element: block });
      }
    }

    searchResults.replaceChildren();
    const entries = [...results.values()].slice(0, 12);
    if (!entries.length) {
      searchResults.append(el("div", "empty-note small", "No matches in this topic."));
      return;
    }
    for (const result of entries) {
      const button = el("button", "help-search-result");
      button.type = "button";
      button.append(el("strong", "", result.heading.textContent?.trim() ?? ""));
      if (result.snippet) button.append(el("span", "", result.snippet));
      button.addEventListener("click", () => {
        setActiveSection(result.heading.id);
        scrollTo(result.element);
      });
      searchResults.append(button);
    }
  };

  const render = (next: HelpTopic) => {
    active = next;
    for (const [id, button] of tabButtons) {
      const selected = id === next;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    }
    search.value = "";
    searchResults.hidden = true;
    searchResults.replaceChildren();
    sidebar.hidden = next === "about";
    layout.classList.toggle("is-about", next === "about");
    if (next === "about") {
      content.replaceChildren(aboutPane());
      sections = [];
    } else {
      content.innerHTML = renderMarkdown(HELP_CONTENT[next], {
        resolveImage: (src) => resolveHelpImage(src),
      });
      const markdown = content.querySelector<HTMLElement>(".markdown");
      if (markdown) buildToc(markdown);
      else {
        sections = [];
        toc.replaceChildren();
        toc.hidden = true;
      }
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

  const scrollToAnchor = (hash: string) => {
    const target = content.querySelector<HTMLElement>(hash);
    if (target) scrollTo(target);
  };

  content.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const image = target.closest<HTMLImageElement>("img.help-figure img, .help-figure img");
    if (image) {
      event.preventDefault();
      openImageLightbox(image.src, image.alt);
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      scrollToAnchor(href);
      return;
    }
    const [file, hash] = href.split("#");
    const topic = DOC_TOPICS[file.split(/[\\/]/).pop() ?? ""];
    if (topic) {
      render(topic);
      if (hash) window.requestAnimationFrame(() => scrollToAnchor(`#${hash}`));
    }
  });

  search.addEventListener("input", runSearch);

  body.append(tabs, layout);
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

function openImageLightbox(src: string, alt: string): void {
  const backdrop = el("div", "help-lightbox");
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", alt || "Help image");
  const image = el("img");
  image.src = src;
  image.alt = alt;
  const close = el("button", "icon-btn help-lightbox-close");
  close.type = "button";
  close.title = "Close image";
  close.setAttribute("aria-label", "Close image");
  close.innerHTML = icon("close", 18);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeLightbox();
  };
  const closeLightbox = () => {
    document.removeEventListener("keydown", onKeyDown, true);
    backdrop.remove();
  };
  close.addEventListener("click", closeLightbox);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeLightbox();
  });
  document.addEventListener("keydown", onKeyDown, true);
  backdrop.append(image, close);
  document.body.append(backdrop);
  close.focus();
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
    ["Project format", `Schema v${SCHEMA_VERSION}`],
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
