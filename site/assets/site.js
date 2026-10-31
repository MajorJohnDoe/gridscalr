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
