const LANGUAGE_KEY = "gridscalr-site-lang";
const HINT_KEY = "gridscalr-site-lang-hint-dismissed";

function readPreference(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private or hardened browser modes.
  }
}

for (const link of document.querySelectorAll("[data-lang-switch] a[hreflang]")) {
  link.addEventListener("click", () => {
    writePreference(LANGUAGE_KEY, link.getAttribute("hreflang"));
  });
}

const hint = document.getElementById("lang-hint");
if (hint && document.documentElement.lang === "en") {
  const browserPrefersSwedish = (navigator.language || "").toLowerCase().startsWith("sv");
  const chosenLanguage = readPreference(LANGUAGE_KEY);
  const dismissed = readPreference(HINT_KEY) === "1";

  if (browserPrefersSwedish && chosenLanguage !== "en" && !dismissed) {
    hint.hidden = false;
  }

  const dismiss = hint.querySelector("[data-dismiss-hint]");
  if (dismiss) {
    dismiss.addEventListener("click", () => {
      hint.hidden = true;
      writePreference(HINT_KEY, "1");
    });
  }
}

function setupLightbox() {
  const triggers = Array.from(document.querySelectorAll("[data-lightbox]"));
  if (!triggers.length || typeof HTMLDialogElement === "undefined") return;

  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.setAttribute("aria-label", "Screenshot viewer");

  const bar = document.createElement("div");
  bar.className = "lightbox-bar";

  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "←";
  previous.setAttribute("aria-label", "Previous screenshot");

  const caption = document.createElement("p");
  caption.className = "lightbox-caption";
  caption.setAttribute("aria-live", "polite");

  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "→";
  next.setAttribute("aria-label", "Next screenshot");

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close screenshot viewer");

  const image = document.createElement("img");
  image.decoding = "async";

  bar.append(previous, caption, next, close);
  dialog.append(bar, image);
  document.body.append(dialog);

  let index = 0;
  let lastTrigger = null;

  const show = (nextIndex) => {
    index = (nextIndex + triggers.length) % triggers.length;
    const trigger = triggers[index];
    const source = trigger.querySelector("img");
    const figure = trigger.closest("figure");
    const text = figure?.querySelector("figcaption")?.textContent?.trim() ?? "";
    image.src = trigger.getAttribute("href") ?? source?.currentSrc ?? source?.src ?? "";
    image.alt = source?.getAttribute("alt") ?? "";
    caption.textContent = `${text} (${index + 1} / ${triggers.length})`;
    previous.disabled = triggers.length < 2;
    next.disabled = triggers.length < 2;
  };

  const open = (nextIndex, trigger) => {
    lastTrigger = trigger;
    show(nextIndex);
    dialog.showModal();
    close.focus();
  };

  triggers.forEach((trigger, triggerIndex) => {
    trigger.addEventListener("click", (event) => {
      if (!dialog.showModal) return;
      event.preventDefault();
      open(triggerIndex, trigger);
    });
  });

  previous.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  close.addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      show(index + 1);
    }
  });

  dialog.addEventListener("close", () => {
    if (lastTrigger instanceof HTMLElement) lastTrigger.focus();
  });
}

setupLightbox();
