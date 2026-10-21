(function () {
  function formatError(error) {
    if (error && error.stack) return String(error.stack);
    if (error && error.message) {
      return String(error.name || "Error") + ": " + error.message;
    }
    if (typeof error === "string") return error;
    try {
      return JSON.stringify(error, null, 2);
    } catch (_) {
      return String(error);
    }
  }

  function showStartupError(error, prefix) {
    if (!document.querySelector("[data-boot-fallback]")) return;

    var status = document.querySelector("[data-boot-status]");
    var detail = document.querySelector("[data-boot-error]");

    if (status) status.textContent = "The interface failed to start.";
    if (detail) {
      detail.hidden = false;
      detail.textContent =
        (prefix ? prefix + "\n\n" : "") +
        formatError(error) +
        "\n\nWebView: " +
        navigator.userAgent;
    }
  }

  window.addEventListener("error", function (event) {
    var target = event.target;
    if (target && target !== window && target.tagName === "SCRIPT") {
      showStartupError(
        "Could not load " + (target.src || "a required script") + ".",
        "Startup script failed."
      );
      return;
    }
    showStartupError(event.error || event.message, "Startup error.");
  });

  window.addEventListener("unhandledrejection", function (event) {
    showStartupError(event.reason, "Unhandled startup error.");
  });
})();
