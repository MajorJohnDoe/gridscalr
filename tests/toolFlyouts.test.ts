// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { store } from "../src/state/store";
import { attachToolFamilyFlyout } from "../src/ui/toolFlyouts";
import { familyForTool, resetFamilyToolMemory } from "../src/ui/toolDefs";

function familyButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  document.body.append(button);
  const family = familyForTool("radius");
  if (!family) throw new Error("Expected the circle and arc family.");
  attachToolFamilyFlyout(button, family);
  return button;
}

function open(button: HTMLButtonElement): HTMLElement {
  button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  if (!menu) throw new Error("Expected an open flyout.");
  return menu;
}

function menuItem(menu: HTMLElement, label: string): HTMLButtonElement {
  const item = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(
    (entry) => entry.textContent?.includes(label),
  );
  if (!item) throw new Error(`Expected a ${label} menu item.`);
  return item;
}

beforeEach(() => {
  resetFamilyToolMemory();
  store.setTool("select");
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("family tool flyout", () => {
  it("opens the family menu with its tools and current selection", () => {
    const menu = open(familyButton());
    expect(menu.getAttribute("aria-label")).toBe("Circle & arc tools");
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(3);
    expect(menuItem(menu, "Radius").getAttribute("aria-checked")).toBe("true");
  });

  it("activates the chosen tool and closes the menu", () => {
    const button = familyButton();
    const menu = open(button);
    menuItem(menu, "Arc").click();

    expect(store.ui.activeTool).toBe("arc");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("remembers the chosen family member on the next open", () => {
    const button = familyButton();
    menuItem(open(button), "Arc").click();
    const menu = open(button);
    expect(menuItem(menu, "Arc").getAttribute("aria-checked")).toBe("true");
  });

  it("closes on Escape", () => {
    const menu = open(familyButton());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(menu.isConnected).toBe(false);
  });

  it("closes on an outside mousedown", () => {
    open(familyButton());
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});
