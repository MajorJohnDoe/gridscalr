// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeMenus, createMenuBar, setMenuActions } from "../src/ui/topMenu";
import type { PanelActions } from "../src/ui/panels";

/**
 * The submenu step-back reads the panel's `data-menu-level` attribute, not a
 * CSS class name, so renaming the styling class cannot break Escape.
 */

function fakeActions(): PanelActions {
  return new Proxy(
    {},
    {
      get: () => () => undefined,
    },
  ) as PanelActions;
}

function escape(): void {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

describe("top menu Escape", () => {
  beforeEach(() => {
    document.body.append(createMenuBar());
    setMenuActions(fakeActions());
  });

  afterEach(() => {
    closeMenus();
    document.body.replaceChildren();
  });

  it("steps back from a submenu and returns focus to its anchor", () => {
    document.querySelector<HTMLButtonElement>('[data-menu="help"]')!.click();
    expect(document.querySelectorAll(".menu-panel")).toHaveLength(1);

    const anchor = document.querySelector<HTMLButtonElement>(".menu-submenu")!;
    anchor.click();
    expect(document.querySelectorAll(".menu-panel")).toHaveLength(2);
    const focusedPanel = document.activeElement?.closest<HTMLElement>("[data-menu-level]");
    expect(focusedPanel?.dataset.menuLevel).toBe("1");

    escape();
    expect(document.querySelectorAll(".menu-panel")).toHaveLength(1);
    expect(document.activeElement).toBe(anchor);
  });
});
