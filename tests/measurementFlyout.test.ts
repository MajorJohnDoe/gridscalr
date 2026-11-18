// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayer, createProject, defaultDocument } from "../src/model/layers";
import type { Project } from "../src/model/types";
import { store, type ToolId } from "../src/state/store";
import { attachMeasurementFlyout } from "../src/ui/toolFlyouts";
import { resetFamilyToolMemory } from "../src/ui/toolDefs";
import { renderMeasurementPanel } from "../src/features/measurementFlyout";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function makeProject(): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
}

function measureButton(tool: ToolId): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  document.body.append(button);
  attachMeasurementFlyout(button, tool);
  return button;
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="New measurement options"]',
  );
}

function field<T extends HTMLElement>(label: string): T {
  const control = document.querySelector<T>(`[aria-label="${label}"]`);
  if (!control) throw new Error(`Expected the ${label} control.`);
  return control;
}

function optionValues(select: HTMLSelectElement): string[] {
  return [...select.options].map((entry) => entry.value);
}

beforeEach(() => {
  resetFamilyToolMemory();
  store.setProject(makeProject(), null);
  store.ui.activeTool = "select";
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.body.replaceChildren();
  store.project = null;
  store.readOnly = false;
});

describe("measurement tool flyout", () => {
  it("opens on a normal left click and selects the rail member", () => {
    const button = measureButton("length");
    button.click();

    expect(store.ui.activeTool).toBe("length");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = dialog();
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-modal")).toBeNull();
    expect(panel?.textContent).toContain("New measurement");
    expect(document.querySelector(".measure-options")).toBeNull();
  });

  it("still opens on a long press and on a right click", () => {
    vi.useFakeTimers();
    const button = measureButton("count");
    button.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    vi.advanceTimersByTime(320);
    expect(dialog()).not.toBeNull();
    button.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    vi.useRealTimers();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dialog()).toBeNull();

    button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(dialog()).not.toBeNull();
  });

  it("keeps the active family member marked and selects another member", () => {
    const button = measureButton("radius");
    button.click();

    const arc = () => {
      const member = [...(dialog()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])].find(
        (entry) => entry.textContent?.includes("Arc"),
      );
      if (!member) throw new Error("Expected the Arc member.");
      return member;
    };
    expect(arc().getAttribute("aria-checked")).toBe("false");

    arc().click();
    expect(store.ui.activeTool).toBe("arc");
    expect(dialog()).toBeNull();

    button.click();
    expect(arc().getAttribute("aria-checked")).toBe("true");
  });

  it("applies category, room, area shape and area mode to the next object", () => {
    const project = store.project;
    if (!project) throw new Error("Expected a project.");
    measureButton("area").click();

    const category = field<HTMLSelectElement>("Category");
    const nextCategory = project.categories[1];
    category.value = nextCategory.id;
    category.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.ui.measureCategoryId).toBe(nextCategory.id);

    const room = field<HTMLInputElement>("Room for new measurements");
    room.value = "Room 204";
    room.dispatchEvent(new Event("input", { bubbles: true }));
    expect(store.ui.measureRoom).toBe("Room 204");

    const shape = field<HTMLSelectElement>("Area shape");
    shape.value = "ellipse";
    shape.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.ui.measureAreaShape).toBe("ellipse");

    const mode = field<HTMLSelectElement>("Area mode");
    mode.value = "subtract";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.ui.measureAreaMode).toBe("subtract");
  });

  it("applies count type, pieces, presets and saves a preset as one undo step", () => {
    measureButton("count").click();

    const type = field<HTMLSelectElement>("Object type");
    type.value = "door";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.ui.measureCountType).toBe("door");

    const pieces = field<HTMLInputElement>("Pieces per new count");
    pieces.value = "3";
    pieces.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.ui.measureCountQuantity).toBe(3);

    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (entry) => entry.textContent === "Save preset",
    );
    if (!save) throw new Error("Expected Save preset.");
    save.click();
    expect(store.project?.countPresets).toHaveLength(1);

    store.undo();
    expect(store.project?.countPresets).toHaveLength(0);
  });

  it("lists only page-scoped visible and unlocked measurement layers", () => {
    const project = store.project;
    if (!project) throw new Error("Expected a project.");
    const pageId = pageIdFor(1);
    const hidden = createLayer("measure", "Hidden layer", undefined, pageId);
    hidden.visible = false;
    const locked = createLayer("measure", "Locked layer", undefined, pageId);
    locked.locked = true;
    const otherPage = createLayer("measure", "Other page layer", undefined, pageIdFor(2));
    const draw = createLayer("draw", "Draw layer", undefined, pageId);
    project.layers.push(hidden, locked, otherPage, draw);

    measureButton("length").click();
    const target = field<HTMLSelectElement>("Target layer");
    const values = optionValues(target);

    expect(values).not.toContain(hidden.id);
    expect(values).not.toContain(locked.id);
    expect(values).not.toContain(otherPage.id);
    expect(values).not.toContain(draw.id);
    expect(values).toContain(project.activeLayerId);
  });

  it("refuses to open in a view-only session and renders no editable controls", () => {
    const button = measureButton("length");
    store.readOnly = true;
    button.click();
    expect(dialog()).toBeNull();

    const panel = document.createElement("div");
    renderMeasurementPanel(panel, {
      tool: "length",
      rerender: () => undefined,
    });
    expect(panel.textContent).toContain("read-only");
    expect(panel.querySelector("select, input, button")).toBeNull();
  });

  it("focuses the first setting, closes on Escape and returns focus to the anchor", () => {
    const button = measureButton("length");
    button.click();
    expect(document.activeElement).toBe(field("Category"));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("removes the old New measurement popover surface", () => {
    const root = resolve(__dirname, "..");
    expect(existsSync(resolve(root, "src/ui/measureOptions.ts"))).toBe(false);
    const contextBar = readFileSync(resolve(root, "src/ui/contextBar.ts"), "utf8");
    expect(contextBar).not.toContain("./measureOptions");
    expect(contextBar).not.toContain("area-mode-toggle");
  });
});
