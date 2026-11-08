/*
 * Pre-paint theme bootstrap. Loaded as an external script so the application
 * CSP can stay script-src 'self'. Keep the palette in sync with
 * src/styles/themes/*.css; this only colours the static boot screen.
 */
(function () {
  var palettes = {
    jade: {
      bg: "#14181b",
      text: "#e8eef1",
      panel: "#1e2428",
      border: "#30383d",
      brand: "#35c2a1",
      muted: "#9aa8ae",
      errorBg: "#241b1b",
      errorBorder: "#4a3030",
      errorText: "#ffb4b4",
    },
    "light-green": {
      bg: "#f4f6f8",
      text: "#1c2735",
      panel: "#ffffff",
      border: "#d5dde7",
      brand: "#0d9a7c",
      muted: "#5a6a7c",
      errorBg: "#fff1f1",
      errorBorder: "#e3b4b4",
      errorText: "#8f2020",
    },
    "dark-grey": {
      bg: "#1a1c1e",
      text: "#e7eaec",
      panel: "#23262a",
      border: "#3a3f44",
      brand: "#4fc7a9",
      muted: "#a1a8ae",
      errorBg: "#2a1f1f",
      errorBorder: "#574040",
      errorText: "#ffc0c0",
    },
    "medium-grey": {
      bg: "#303234",
      text: "#e3e6e8",
      panel: "#36393b",
      border: "#4f5459",
      brand: "#4fc7a9",
      muted: "#adb5bb",
      errorBg: "#3a2626",
      errorBorder: "#6b4444",
      errorText: "#ffc4c4",
    },
    navy: {
      bg: "#121a26",
      text: "#e6edf7",
      panel: "#19232f",
      border: "#2e3d52",
      brand: "#35c2a1",
      muted: "#93a2b8",
      errorBg: "#251b22",
      errorBorder: "#4d3038",
      errorText: "#ffb4c0",
    },
  };

  try {
    var stored = JSON.parse(localStorage.getItem("gridscalr.preferences.v1") || "{}");
    var preference = stored.theme || "medium-grey";
    var theme = preference;
    if (preference === "system") {
      theme =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light-green"
          : "medium-grey";
    }
    if (theme === "grey") theme = "dark-grey";
    if (theme === "default") theme = "jade";
    if (!palettes[theme]) theme = "medium-grey";
    var palette = palettes[theme];
    var root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme === "light-green" ? "light" : "dark";
    root.style.setProperty("--boot-bg", palette.bg);
    root.style.setProperty("--boot-text", palette.text);
    root.style.setProperty("--boot-panel", palette.panel);
    root.style.setProperty("--boot-border", palette.border);
    root.style.setProperty("--boot-brand", palette.brand);
    root.style.setProperty("--boot-muted", palette.muted);
    root.style.setProperty("--boot-error-bg", palette.errorBg);
    root.style.setProperty("--boot-error-border", palette.errorBorder);
    root.style.setProperty("--boot-error-text", palette.errorText);
  } catch (error) {
    /* The defaults in index.html remain usable. */
  }
})();
