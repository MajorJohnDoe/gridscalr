// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { el } from "../src/ui/dom";
import { showModal } from "../src/ui/dialogs";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function clickFooter(label: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>(".modal-footer button")].find(
    (entry) => entry.textContent === label,
  );
  button?.click();
}

afterEach(() => {
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
});

describe("dialog focus", () => {
  it("focuses Cancel instead of a destructive primary action", async () => {
    const trigger = el("button", "", "Open");
    document.body.append(trigger);
    trigger.focus();

    const body = el("div");
    body.append(el("p", "", "Delete this item?"));
    const result = showModal({
      title: "Delete item",
      body,
      actions: [
        { label: "Delete", value: "delete", primary: true, danger: true },
        { label: "Cancel", value: "__cancel__" },
      ],
    });

    await nextFrame();
    expect(document.activeElement?.textContent).toBe("Cancel");

    clickFooter("Cancel");
    await expect(result).resolves.toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("focuses the first text input", async () => {
    const body = el("div");
    const input = el("input");
    body.append(input);
    const result = showModal({
      title: "Rename",
      body,
      actions: [
        { label: "Cancel", value: "__cancel__" },
        { label: "Save", value: "save", primary: true },
      ],
    });

    await nextFrame();
    expect(document.activeElement).toBe(input);

    clickFooter("Cancel");
    await expect(result).resolves.toBeNull();
  });

  it("focuses a safe primary action when there is no input", async () => {
    const result = showModal({
      title: "Apply",
      body: el("div", "", "Apply these settings?"),
      actions: [
        { label: "Cancel", value: "__cancel__" },
        { label: "Apply", value: "apply", primary: true },
      ],
    });

    await nextFrame();
    expect(document.activeElement?.textContent).toBe("Apply");

    clickFooter("Apply");
    await expect(result).resolves.toBe("apply");
  });
});
