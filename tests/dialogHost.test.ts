// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clampDialogPosition,
  DialogStack,
  DIALOG_MARGIN,
  DIALOG_Z_BASE,
} from "../src/features/dialogHost";
import {
  closeActiveModal,
  closeAllDialogs,
  confirmDialog,
  dialogCount,
  setDialogTitle,
  showModal,
  topDialogId,
} from "../src/ui/dialogs";
import { el } from "../src/ui/dom";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function dialogs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".modal")];
}

function layers(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".dialog-layer")];
}

function dialog(selector = ".modal"): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

function footerButton(label: string, root: ParentNode = document): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>(".modal-footer button")].find(
    (entry) => entry.textContent === label,
  );
}

function pointer(target: Element, type: string, init: { clientX: number; clientY: number }): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: init.clientX,
      clientY: init.clientY,
    }),
  );
}

function escape(): void {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function simpleBody(text = "Body"): HTMLElement {
  const body = el("div");
  body.append(el("p", "", text));
  return body;
}

afterEach(() => {
  closeAllDialogs();
  layers().forEach((node) => node.remove());
  document.body.replaceChildren();
});

describe("dialog window model", () => {
  it("clamps a window to the viewport and keeps the header reachable", () => {
    const size = { width: 400, height: 300 };
    const viewport = { width: 1000, height: 800 };
    expect(clampDialogPosition({ x: -500, y: -500 }, size, viewport)).toEqual({
      x: DIALOG_MARGIN,
      y: DIALOG_MARGIN,
    });
    expect(clampDialogPosition({ x: 5000, y: 5000 }, size, viewport)).toEqual({
      x: 1000 - 400 - DIALOG_MARGIN,
      y: 800 - 300 - DIALOG_MARGIN,
    });
    // A window larger than the viewport keeps its top-left at the margin.
    expect(
      clampDialogPosition({ x: 900, y: 900 }, { width: 2000, height: 2000 }, viewport),
    ).toEqual({ x: DIALOG_MARGIN, y: DIALOG_MARGIN });
  });

  it("stacks focus-to-front with a monotonic z-index", () => {
    const stack = new DialogStack();
    const first = stack.open("first");
    const second = stack.open("second");
    expect(first).toBe(DIALOG_Z_BASE + 1);
    expect(second).toBeGreaterThan(first);
    expect(stack.top()).toBe("second");
    const raised = stack.raise("first");
    expect(raised).toBeGreaterThan(second);
    expect(stack.top()).toBe("first");
    expect(stack.ids()).toEqual(["second", "first"]);
    stack.close("first");
    expect(stack.top()).toBe("second");
  });
});

describe("non-modal dialog window", () => {
  it("is a named, non-modal dialog with no dimming backdrop", async () => {
    void showModal({ title: "Rename layer", body: simpleBody(), actions: [] });
    await nextFrame();
    const modal = dialog()!;
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("false");
    const labelledBy = modal.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledBy)?.textContent).toBe("Rename layer");
    expect(document.querySelector(".modal-backdrop")).toBeNull();
    expect(layers()).toHaveLength(1);
    expect(layers()[0].classList.contains("dialog-layer")).toBe(true);
  });

  it("keeps initial focus inside but does not trap Tab", async () => {
    const outside = el("button", "", "Outside");
    document.body.append(outside);
    const input = el("input");
    const body = el("div");
    body.append(input);
    void showModal({
      title: "Rename",
      body,
      actions: [{ label: "Cancel", value: "__cancel__" }],
    });
    await nextFrame();
    expect(document.activeElement).toBe(input);

    // Tab is not intercepted: the browser is free to move focus out, and
    // focus can re-enter the window.
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    input.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    outside.focus();
    expect(document.activeElement).toBe(outside);
    expect(dialogCount()).toBe(1);
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it("returns focus to the opener when it closes", async () => {
    const trigger = el("button", "", "Open");
    document.body.append(trigger);
    trigger.focus();
    const result = showModal({
      title: "Prompt",
      body: simpleBody(),
      actions: [{ label: "Close", value: "close" }],
    });
    await nextFrame();
    expect(document.activeElement).not.toBe(trigger);
    footerButton("Close")!.click();
    await expect(result).resolves.toBe("close");
    expect(document.activeElement).toBe(trigger);
  });

  it("Escape closes only the topmost dialog and leaves the other open", async () => {
    const first = showModal({
      title: "First",
      body: simpleBody("first"),
      actions: [{ label: "Close first", value: "close" }],
    });
    await nextFrame();
    const second = showModal({
      title: "Second",
      body: simpleBody("second"),
      actions: [{ label: "Close second", value: "close" }],
    });
    await nextFrame();
    expect(dialogCount()).toBe(2);
    const top = topDialogId();

    escape();
    await expect(second).resolves.toBeNull();
    expect(dialogCount()).toBe(1);
    expect(topDialogId()).not.toBe(top);
    expect(dialog()?.textContent).toContain("First");

    escape();
    await expect(first).resolves.toBeNull();
    expect(dialogCount()).toBe(0);
  });

  it("stacks deterministically and raises the dialog that receives focus", async () => {
    void showModal({ title: "First", body: simpleBody(), actions: [] });
    await nextFrame();
    void showModal({ title: "Second", body: simpleBody(), actions: [] });
    await nextFrame();

    const [newest, oldest] = layers();
    expect(Number(newest.dataset.dialogLevel)).toBeGreaterThan(Number(oldest.dataset.dialogLevel));
    expect(newest.classList.contains("is-top")).toBe(true);

    oldest.querySelector<HTMLElement>(".modal-body")!.tabIndex = -1;
    oldest.querySelector<HTMLElement>(".modal-body")!.focus();
    expect(Number(oldest.dataset.dialogLevel)).toBeGreaterThan(Number(newest.dataset.dialogLevel));
    expect(oldest.classList.contains("is-top")).toBe(true);
  });

  it("moves by the header, clamps to the viewport and keeps two windows independent", async () => {
    void showModal({ title: "First", body: simpleBody(), actions: [] });
    await nextFrame();
    void showModal({ title: "Second", body: simpleBody(), actions: [] });
    await nextFrame();

    const [second, first] = dialogs();
    for (const modal of [first, second]) {
      modal.style.width = "400px";
      modal.style.height = "300px";
    }
    const secondHeader = second.querySelector<HTMLElement>(".modal-header")!;
    pointer(secondHeader, "pointerdown", { clientX: 100, clientY: 100 });
    pointer(secondHeader, "pointermove", { clientX: 5000, clientY: 5000 });
    pointer(secondHeader, "pointerup", { clientX: 5000, clientY: 5000 });

    expect(second.style.left).toBe(`${window.innerWidth - 400 - DIALOG_MARGIN}px`);
    expect(second.style.top).toBe(`${window.innerHeight - 300 - DIALOG_MARGIN}px`);
    expect(first.style.left).not.toBe(second.style.left);

    const firstLeft = first.style.left;
    const firstHeader = first.querySelector<HTMLElement>(".modal-header")!;
    pointer(firstHeader, "pointerdown", { clientX: 100, clientY: 100 });
    pointer(firstHeader, "pointermove", { clientX: 140, clientY: 160 });
    pointer(firstHeader, "pointerup", { clientX: 140, clientY: 160 });
    expect(first.style.left).not.toBe(firstLeft);
    expect(second.style.left).toBe(`${window.innerWidth - 400 - DIALOG_MARGIN}px`);
  });

  it("does not drag from the body or from a control in the header", async () => {
    void showModal({ title: "Fixed", body: simpleBody(), actions: [] });
    await nextFrame();
    const modal = dialog()!;
    modal.style.width = "400px";
    modal.style.height = "300px";
    const before = { left: modal.style.left, top: modal.style.top };

    const body = modal.querySelector<HTMLElement>(".modal-body")!;
    pointer(body, "pointerdown", { clientX: 50, clientY: 50 });
    pointer(body, "pointermove", { clientX: 400, clientY: 400 });
    pointer(body, "pointerup", { clientX: 400, clientY: 400 });
    expect(modal.style.left).toBe(before.left);
    expect(modal.style.top).toBe(before.top);

    const close = modal.querySelector<HTMLElement>(".modal-close")!;
    pointer(close, "pointerdown", { clientX: 50, clientY: 50 });
    pointer(close, "pointermove", { clientX: 400, clientY: 400 });
    expect(modal.style.left).toBe(before.left);
    expect(modal.style.top).toBe(before.top);
  });

  it("exposes a reusable header action surface beside the close control", async () => {
    const reload = el("button", "icon-btn", "Reload");
    void showModal({
      title: "Table editor",
      body: simpleBody(),
      actions: [],
      headerActions: [reload],
    });
    await nextFrame();
    const header = dialog(".modal-header")!;
    const actions = header.querySelector<HTMLElement>(".modal-header-actions")!;
    expect(actions.contains(reload)).toBe(true);
    expect(header.lastElementChild?.classList.contains("modal-close")).toBe(true);
    expect(
      actions.compareDocumentPosition(header.lastElementChild!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("retitles an open window in place", async () => {
    void showModal({ title: "New takeoff table", body: simpleBody(), actions: [] });
    await nextFrame();
    const modal = dialog()!;
    setDialogTitle(modal, "Edit takeoff table");
    expect(modal.querySelector(".modal-titles h2")?.textContent).toBe("Edit takeoff table");
    // The window is the same one, not a second copy.
    expect(dialogs()).toHaveLength(1);
  });
});

describe("destructive confirmation revalidation", () => {
  it("refuses and explains when the target no longer exists", async () => {
    let current: string | null = "layer-1";
    const result = confirmDialog("Delete layer", "Delete “Walls”?", "Delete", {
      danger: true,
      target: {
        kind: "layer",
        id: "layer-1",
        name: "Walls",
        resolve: () => current,
      },
    });
    await nextFrame();
    current = null;
    footerButton("Delete")!.click();
    await tick();

    const error = dialog(".form-error");
    expect(error?.textContent).toContain("Walls");
    expect(error?.textContent).toContain("no longer exists");
    expect(dialogCount()).toBe(1);
    footerButton("Cancel")!.click();
    await expect(result).resolves.toBe(false);
  });

  it("refuses when the same stable id resolves to another object", async () => {
    let current = "layer-1";
    const result = confirmDialog("Delete layer", "Delete “Walls”?", "Delete", {
      danger: true,
      target: {
        kind: "layer",
        id: "layer-1",
        name: "Walls",
        resolve: () => current,
      },
    });
    await nextFrame();
    current = "layer-2";
    footerButton("Delete")!.click();
    await tick();
    expect(dialog(".form-error")?.textContent).toContain("changed");
    footerButton("Cancel")!.click();
    await expect(result).resolves.toBe(false);
  });

  it("confirms when the target is unchanged", async () => {
    const seen: string[] = [];
    const result = confirmDialog("Delete layer", "Delete “Walls”?", "Delete", {
      danger: true,
      target: {
        kind: "layer",
        id: "layer-1",
        name: "Walls",
        resolve: () => {
          seen.push("checked");
          return "layer-1";
        },
      },
    });
    await nextFrame();
    footerButton("Delete")!.click();
    await expect(result).resolves.toBe(true);
    expect(seen).toEqual(["checked"]);
  });
});

describe("dialog cleanup", () => {
  it("closes the topmost dialog only", async () => {
    void showModal({ title: "First", body: simpleBody(), actions: [] });
    await nextFrame();
    const top = topDialogId();
    void showModal({ title: "Second", body: simpleBody(), actions: [] });
    await nextFrame();
    closeActiveModal();
    expect(dialogCount()).toBe(1);
    expect(topDialogId()).toBe(top);
  });
});
