/** Temporary diagnostics for the Windows pinch-zoom test build. */
let badge: HTMLElement | null = null;
let count = 0;

export function reportWheelDebug(event: WheelEvent, factor: number): void {
  if (typeof document === "undefined") return;
  if (!badge) {
    badge = document.createElement("div");
    badge.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:42px",
      "z-index:9999",
      "padding:4px 7px",
      "border:1px solid #f2a93b",
      "border-radius:5px",
      "background:#1b2125",
      "color:#f7fbfc",
      "font:11px/1.3 monospace",
      "pointer-events:none",
      "white-space:pre",
    ].join(";");
    document.body.append(badge);
  }
  count += 1;
  badge.textContent = `PINCH DEBUG ${count}\nctrl=${event.ctrlKey} meta=${event.metaKey}\ndy=${event.deltaY.toFixed(2)} mode=${event.deltaMode}\nfactor=${factor.toFixed(3)}`;
}
