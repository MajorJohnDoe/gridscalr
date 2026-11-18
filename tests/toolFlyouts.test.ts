// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { store, type ToolId } from "../src/state/store";
import {
  attachToolFamilyFlyout,
  attachToolFlyout,
  openToolVariants,
  VARIANT_FLYOUT_IDS,
} from "../src/ui/toolFlyouts";
import { familyForTool, hasToolVariants, resetFamilyToolMemory, TOOLS } from "../src/ui/toolDefs";

function familyButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  document.body.append(button);
  const family = familyForTool("radius");
  if (!family) throw new Error("Expected the circle and arc family.");
  attachToolFamilyFlyout(button, family);
  return button;
}

/** A rail slot: the rail's own handler selects the tool, then the flyout helper. */
function variantButton(toolId: ToolId): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  document.body.append(button);
  button.addEventListener("click", () => store.setTool(toolId));
  attachToolFlyout(button, toolId);
  return button;
}

function openedMenu(): HTMLElement {
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  if (!menu) throw new Error("Expected an open flyout.");
  return menu;
}

function open(button: HTMLButtonElement): HTMLElement {
  button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  return openedMenu();
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
  store.setStyle({ shapeFill: "outline", dashed: false });
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.body.replaceChildren();
});

describe("family tool flyout", () => {
  it("opens the family menu with its tools and current selection", () => {
    const menu = open(familyButton());
    expect(menu.getAttribute("aria-label")).toBe("Circle & arc tools");
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(3);
    expect(menuItem(menu, "Radius").getAttribute("aria-checked")).toBe("true");
  });

  it("opens the family menu on a normal left click", () => {
    const button = familyButton();
    button.click();
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.getAttribute("aria-label")).toBe("Circle & arc tools");
  });

  it("opens the shape menu with fill, colour and line controls", () => {
    const button = document.createElement("button");
    button.type = "button";
    document.body.append(button);
    const family = familyForTool("rect");
    if (!family) throw new Error("Expected the shape family.");
    attachToolFamilyFlyout(button, family);

    const menu = open(button);
    expect(menu.getAttribute("aria-label")).toBe("Shapes");
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(4);
    for (const label of [
      "Rectangle, filled",
      "Rectangle, outline only",
      "Ellipse, filled",
      "Ellipse, outline only",
      "Colour",
      "Stroke width",
      "Line style",
    ]) {
      expect(menu.textContent).toContain(label);
    }

    menuItem(menu, "Rectangle, filled").click();
    expect(store.ui.activeTool).toBe("rect");
    expect(store.ui.style.shapeFill).toBe("filled");
    menuItem(menu, "Rectangle, outline only").click();
    expect(store.ui.style.shapeFill).toBe("outline");
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

describe("variant tool flyout", () => {
  const variantTools = TOOLS.filter((tool) => hasToolVariants(tool.id)).map((tool) => tool.id);

  it("keeps the declared variant tools and the flyout panels in step", () => {
    // A tool that declares `variantFlyout` without a panel, or a panel without
    // the metadata, fails here instead of opening nothing or silently falling
    // back to another tool's panel.
    expect([...variantTools].sort()).toEqual([...VARIANT_FLYOUT_IDS].sort());
    expect(variantTools).toEqual(
      expect.arrayContaining([
        "cloud",
        "highlight",
        "callout",
        "stamp",
        "arrow",
        "line",
        "polyline",
      ]),
    );
  });

  it("opens on one left click and still selects the base tool, for every variant tool", () => {
    for (const toolId of variantTools) {
      store.setTool("select");
      const button = variantButton(toolId);
      expect(button.classList.contains("has-variants")).toBe(true);
      expect(button.getAttribute("aria-haspopup")).toBe("menu");

      button.click();

      expect(store.ui.activeTool).toBe(toolId);
      const menu = openedMenu();
      expect(menu.getAttribute("aria-label")).toBeTruthy();
      expect(button.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("still opens on a long press and on a right click", () => {
    vi.useFakeTimers();
    const button = variantButton("cloud");
    button.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    vi.advanceTimersByTime(320);
    expect(openedMenu().getAttribute("aria-label")).toBe("Revision cloud variants");
    button.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    vi.useRealTimers();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    open(button);
    expect(openedMenu().getAttribute("aria-label")).toBe("Revision cloud variants");
  });

  it("ignores a tool without variant metadata", () => {
    const button = document.createElement("button");
    button.type = "button";
    document.body.append(button);
    attachToolFlyout(button, "pen");
    button.click();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(button.classList.contains("has-variants")).toBe(false);
    openToolVariants(button, "pen");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("uses the selected tool's own panel, not another tool's", () => {
    variantButton("stamp").click();
    expect(openedMenu().getAttribute("aria-label")).toBe("Stamp presets");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    variantButton("polyline").click();
    const menu = openedMenu();
    expect(menu.getAttribute("aria-label")).toBe("Pipe & duct options");
    expect(menu.textContent).toContain("Stroke width");
  });
});
