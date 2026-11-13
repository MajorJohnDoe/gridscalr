// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clear, el } from "../src/ui/dom";
import {
  captureField,
  disposeShellRender,
  isEditableField,
  requestShellRender,
  restoreField,
  type FieldSnapshot,
} from "../src/ui/editSafeRender";

const roots: HTMLElement[] = [];

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Shell {
  root: HTMLElement;
  scroller: HTMLElement;
  paint: () => void;
  paints: () => number;
}

/** A shell root with one scrollable panel, like the inspector. */
function buildShell(): Shell {
  document.body.replaceChildren();
  const root = el("div", "app-shell");
  const scroller = el("div", "inspector");
  scroller.style.overflowY = "auto";
  // jsdom has no layout, so scrollTop is a plain value for the test.
  let scrollTop = 0;
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  root.append(scroller);
  document.body.append(root);
  roots.push(root);
  let paints = 0;
  return {
    root,
    scroller,
    paints: () => paints,
    paint: () => {
      paints += 1;
      clear(scroller);
      scroller.append(panel());
    },
  };
}

function panel(): HTMLElement {
  const section = el("div", "selection-section");
  const field = el("label", "field");
  field.append(el("span", "field-label", "Label"));
  const input = el("input", "input");
  input.id = "selection-label-input";
  input.dataset.role = "selection-label";
  input.value = "";
  field.append(input);
  section.append(field);
  return section;
}

function labelField(): HTMLInputElement {
  const input = document.getElementById("selection-label-input");
  if (!(input instanceof HTMLInputElement)) throw new Error("missing label field");
  return input;
}

afterEach(() => {
  for (const root of roots.splice(0)) disposeShellRender(root);
  document.body.replaceChildren();
});

describe("edit-safe shell render", () => {
  it("defers a background render until the focused field loses focus", async () => {
    const shell = buildShell();
    shell.paint();
    const before = shell.paints();
    const input = labelField();
    input.value = "Floor 2";
    input.focus();
    input.setSelectionRange(3, 3);

    requestShellRender(shell.root, "save", shell.paint);
    await nextTick();

    expect(shell.paints() - before).toBe(0);
    expect(document.activeElement).toBe(input);
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("Floor 2");

    input.blur();
    await nextTick();

    expect(shell.paints() - before).toBe(1);
    // The user left the field, so the deferred render must not take focus back.
    expect(document.activeElement).toBe(document.body);
  });

  it("restores focus, value, caret and the panel scroll after an immediate render", async () => {
    const shell = buildShell();
    shell.paint();
    const before = shell.paints();
    const input = labelField();
    input.value = "Floor 2";
    input.focus();
    input.setSelectionRange(2, 5);
    shell.scroller.scrollTop = 140;
    const paint = () => {
      shell.paint();
      // A rebuild starts the panel at the top; the render has to put it back.
      shell.scroller.scrollTop = 0;
    };

    requestShellRender(shell.root, "change", paint);
    expect(shell.paints() - before).toBe(0);
    expect(document.activeElement).toBe(input);

    await nextTick();

    const restored = labelField();
    expect(shell.paints() - before).toBe(1);
    expect(restored).not.toBe(input);
    expect(document.activeElement).toBe(restored);
    expect(restored.value).toBe("Floor 2");
    expect(restored.selectionStart).toBe(2);
    expect(restored.selectionEnd).toBe(5);
    expect(shell.scroller.scrollTop).toBe(140);
  });

  it("keeps the value committed by Enter and restores the caret", async () => {
    const shell = buildShell();
    shell.paint();
    const input = labelField();
    input.value = "AHU-01";
    input.focus();
    input.setSelectionRange(4, 4);
    input.addEventListener("change", () => {
      requestShellRender(shell.root, "change", shell.paint);
    });
    shell.scroller.scrollTop = 60;

    input.dispatchEvent(new Event("change"));
    await nextTick();

    const restored = labelField();
    expect(document.activeElement).toBe(restored);
    expect(restored.value).toBe("AHU-01");
    expect(restored.selectionStart).toBe(4);
    expect(restored.selectionEnd).toBe(4);
  });

  it("queues a render requested inside a running render instead of nesting", async () => {
    const shell = buildShell();
    const depth = { current: 0, max: 0 };
    let paints = 0;
    const paint = () => {
      paints += 1;
      depth.current += 1;
      depth.max = Math.max(depth.max, depth.current);
      if (paints === 1) requestShellRender(shell.root, "change", paint);
      depth.current -= 1;
    };

    requestShellRender(shell.root, "change", paint);

    expect(paints).toBe(2);
    expect(depth.max).toBe(1);
  });

  it("paints synchronously when no field is focused", () => {
    const shell = buildShell();
    requestShellRender(shell.root, "change", shell.paint);
    expect(shell.paints()).toBe(1);
  });

  it("does not steal focus from a control the user moved to", () => {
    const shell = buildShell();
    shell.paint();
    const input = labelField();
    input.value = "Old";
    input.focus();
    const snapshot: FieldSnapshot = captureField(shell.root, input)!;

    const other = el("input", "input");
    other.id = "layer-name-input";
    shell.scroller.append(other);
    other.focus();

    restoreField(shell.root, snapshot);

    expect(document.activeElement).toBe(other);
    expect(other.value).toBe("");
  });

  it("skips a field that only matches by structure when restoring the value", () => {
    const shell = buildShell();
    const wrapper = el("div", "field");
    const bare = el("input", "input");
    wrapper.append(bare);
    shell.scroller.append(wrapper);
    bare.value = "typed";
    bare.focus();
    const snapshot = captureField(shell.root, bare)!;

    clear(shell.scroller);
    const rebuiltWrapper = el("div", "field");
    const rebuilt = el("input", "input");
    rebuilt.value = "stored";
    rebuiltWrapper.append(rebuilt);
    shell.scroller.append(rebuiltWrapper);

    restoreField(shell.root, snapshot);

    expect(document.activeElement).toBe(rebuilt);
    // Focus survives, but a structural match is not identity: the rendered
    // value wins.
    expect(rebuilt.value).toBe("stored");
  });

  it("ignores focus outside the shell and non-editable controls", () => {
    const shell = buildShell();
    shell.paint();
    const outside = el("input", "input");
    document.body.append(outside);
    outside.focus();

    expect(captureField(shell.root, outside)).toBe(null);
    expect(isEditableField(document.body)).toBe(false);
    expect(isEditableField(labelField())).toBe(true);
  });

  it("clears atomically so a nested removal cannot throw", () => {
    const node = el("div");
    node.append(el("span"), el("em"));
    const remove = vi.spyOn(node, "removeChild").mockImplementation(() => {
      throw new Error("nested removal");
    });

    expect(() => clear(node)).not.toThrow();
    expect(node.childNodes.length).toBe(0);

    remove.mockRestore();
  });
});
