// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  closeTopTransient,
  registerTransientOverlay,
  TRANSIENT_Z_BASE,
  TransientStack,
  type TransientOverlayHandle,
} from "../src/features/transientOverlay";
import { closeAllDialogs, dialogCount, showModal, topDialogId } from "../src/ui/dialogs";
import { el } from "../src/ui/dom";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function escape(): void {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function surface(
  className: string,
  onEscape: () => void,
): {
  root: HTMLElement;
  handle: TransientOverlayHandle;
} {
  const root = el("div", className);
  document.body.append(root);
  return { root, handle: registerTransientOverlay(root, onEscape) };
}

afterEach(() => {
  while (closeTopTransient()) {
    // Every host unregisters in its own Escape callback.
  }
  closeAllDialogs();
  document.body.replaceChildren();
});

describe("transient overlay order", () => {
  it("uses one monotonic order above the dialog band", () => {
    const stack = new TransientStack();
    const first = stack.open("flyout");
    const second = stack.open("popover");
    expect(first).toBe(TRANSIENT_Z_BASE + 1);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(2000);
    expect(stack.top()).toBe("popover");
    expect(stack.raise("flyout")).toBeGreaterThan(second);
    expect(stack.top()).toBe("flyout");
  });

  it("paints a later transient surface above the first and the dialog", async () => {
    const dialog = showModal({ title: "Dialog", body: el("div"), actions: [] });
    await nextFrame();
    const first = surface("first-surface", () => undefined);
    const second = surface("second-surface", () => undefined);
    const dialogLayer = document.querySelector<HTMLElement>(".dialog-layer")!;

    expect(Number(first.root.style.zIndex)).toBeGreaterThan(Number(dialogLayer.style.zIndex));
    expect(Number(second.root.style.zIndex)).toBeGreaterThan(Number(first.root.style.zIndex));
    first.handle.raise();
    expect(Number(first.root.style.zIndex)).toBeGreaterThan(Number(second.root.style.zIndex));

    first.handle.unregister();
    second.handle.unregister();
    first.root.remove();
    second.root.remove();
    void dialog;
  });
});

describe("transient overlay Escape routing", () => {
  it("closes two transient surfaces, topmost first, before the dialog underneath", async () => {
    const events: string[] = [];
    const dialog = showModal({ title: "Dialog", body: el("div"), actions: [] });
    await nextFrame();
    const dialogId = topDialogId();

    // The first surface has the old flyout class; the second has no known
    // class at all. Neither may close the dialog underneath it.
    const first = surface("tool-flyout", () => {
      events.push("first");
      first.handle.unregister();
      first.root.remove();
    });
    const second = surface("custom-transient-surface", () => {
      events.push("second");
      second.handle.unregister();
      second.root.remove();
    });

    escape();
    expect(events).toEqual(["second"]);
    expect(dialogCount()).toBe(1);
    expect(topDialogId()).toBe(dialogId);

    escape();
    expect(events).toEqual(["second", "first"]);
    expect(dialogCount()).toBe(1);
    expect(topDialogId()).toBe(dialogId);

    escape();
    await expect(dialog).resolves.toBeNull();
    expect(events).toEqual(["second", "first"]);
    expect(dialogCount()).toBe(0);
  });
});
