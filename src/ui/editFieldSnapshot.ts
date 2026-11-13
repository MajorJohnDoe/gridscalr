import { isEditableTarget } from "./dom";

/**
 * What a shell rebuild has to put back.
 *
 * The shell paints from state, so a panel rebuild replaces every field in it.
 * This module captures the field that had focus before the rebuild, finds the
 * replacement afterwards and restores focus, value, selection and the scroll
 * offset of the panel. `editSafeRender.ts` owns when that happens.
 */

/** Input types that hold a text selection and can have it restored. */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
]);

/** Everything needed to put the user back after the panel was rebuilt. */
export interface FieldSnapshot {
  tag: string;
  type: string;
  id: string;
  role: string | null;
  /** Child indices from the shell root to the field in the old tree. */
  path: number[];
  /** Null for a contenteditable field, whose node survives the rebuild. */
  value: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: "forward" | "backward" | "none" | null;
  scrollNode: HTMLElement | null;
  scrollTop: number;
  scrollLeft: number;
}

/** True when the node is a field the user can type in or commit a value from. */
export function isEditableField(node: EventTarget | null): node is HTMLElement {
  return node instanceof HTMLElement && isEditableTarget(node);
}

/**
 * Snapshot the focused field before a render removes it.
 *
 * Returns null when the focus is outside the shell, on `body`, or on a control
 * that is not editable.
 */
export function captureField(root: HTMLElement, active: Element | null): FieldSnapshot | null {
  if (!isEditableField(active) || !root.contains(active)) return null;
  const path = pathFrom(root, active);
  if (!path) return null;
  const selection = readSelection(active);
  const scrollNode = findScrollContainer(active, root);
  return {
    tag: active.tagName,
    type: inputType(active),
    id: active.id,
    role: active.dataset.role ?? null,
    path,
    value: currentValue(active),
    selectionStart: selection?.start ?? null,
    selectionEnd: selection?.end ?? null,
    selectionDirection: selection?.direction ?? null,
    scrollNode,
    scrollTop: scrollNode?.scrollTop ?? 0,
    scrollLeft: scrollNode?.scrollLeft ?? 0,
  };
}

/**
 * Find the rebuilt field for a snapshot and put the user back.
 *
 * A field is recognised by id, then by `data-role`, then by its structural
 * path. The value is written back only for a stable match: restoring text into
 * a field that merely sits in the same place could overwrite another item's
 * label after a selection change.
 */
export function restoreField(root: HTMLElement, snapshot: FieldSnapshot): void {
  const match = findFieldTarget(root, snapshot);
  if (!match) return;
  const target = match.node;
  const doc = root.ownerDocument;
  const active = doc.activeElement;
  // The user moved to another control while the render was queued; never steal
  // focus back from it.
  const movedOn =
    active instanceof HTMLElement &&
    active !== target &&
    active !== doc.body &&
    root.contains(active);
  if (movedOn) return;
  if (active !== target) target.focus({ preventScroll: true });
  if (match.exact && snapshot.value !== null) writeValue(target, snapshot.value);
  restoreSelection(target, snapshot);
  if (!snapshot.scrollNode) return;
  const scroller = snapshot.scrollNode.isConnected
    ? snapshot.scrollNode
    : findScrollContainer(target, root);
  if (!scroller) return;
  scroller.scrollTop = snapshot.scrollTop;
  scroller.scrollLeft = snapshot.scrollLeft;
}

/** The nearest ancestor that scrolls, so a rebuild cannot jump the panel. */
export function findScrollContainer(element: HTMLElement, root: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    const view = node.ownerDocument.defaultView;
    const overflowY = view?.getComputedStyle(node).overflowY ?? "";
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      node.scrollTop > 0 ||
      node.scrollLeft > 0
    ) {
      return node;
    }
    if (node === root) return null;
    node = node.parentElement;
  }
  return null;
}

function inputType(element: HTMLElement): string {
  return element instanceof HTMLInputElement ? element.type.toLowerCase() : "";
}

function isTextControl(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(inputType(element));
}

function readSelection(
  element: HTMLElement,
): { start: number; end: number; direction: "forward" | "backward" | "none" } | null {
  if (!isTextControl(element)) return null;
  try {
    const { selectionStart, selectionEnd, selectionDirection } = element;
    if (selectionStart === null || selectionEnd === null) return null;
    return { start: selectionStart, end: selectionEnd, direction: selectionDirection ?? "none" };
  } catch {
    // Some input types refuse selection access.
    return null;
  }
}

function restoreSelection(target: HTMLElement, snapshot: FieldSnapshot): void {
  if (!isTextControl(target) || snapshot.selectionStart === null) return;
  const length = target.value.length;
  const start = Math.min(snapshot.selectionStart, length);
  const end = Math.min(snapshot.selectionEnd ?? start, length);
  try {
    target.setSelectionRange(start, end, snapshot.selectionDirection ?? undefined);
  } catch {
    // Ignore a control that no longer supports a selection.
  }
}

function currentValue(element: HTMLElement): string | null {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  return null;
}

function writeValue(target: HTMLElement, value: string): void {
  if (target instanceof HTMLSelectElement) {
    if (![...target.options].some((entry) => entry.value === value)) return;
    target.value = value;
    return;
  }
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (target.value !== value) target.value = value;
}

function pathFrom(root: HTMLElement, element: HTMLElement): number[] | null {
  const path: number[] = [];
  let node: HTMLElement | null = element;
  while (node && node !== root) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) return null;
    path.unshift([...parent.children].indexOf(node));
    node = parent;
  }
  return node === root ? path : null;
}

function matchesShape(node: Element, snapshot: FieldSnapshot): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.tagName !== snapshot.tag || inputType(node) !== snapshot.type) return false;
  return !(node as HTMLInputElement).disabled;
}

function findFieldTarget(
  root: HTMLElement,
  snapshot: FieldSnapshot,
): { node: HTMLElement; exact: boolean } | null {
  if (snapshot.id) {
    const byId = root.ownerDocument.getElementById(snapshot.id);
    if (byId && root.contains(byId) && matchesShape(byId, snapshot)) {
      return { node: byId, exact: true };
    }
  }
  if (snapshot.role) {
    for (const node of root.querySelectorAll("[data-role]")) {
      if (node.getAttribute("data-role") === snapshot.role && matchesShape(node, snapshot)) {
        return { node, exact: true };
      }
    }
  }
  let node: Element | null = root;
  for (const index of snapshot.path) {
    node = node?.children[index] ?? null;
    if (!node) return null;
  }
  return node && matchesShape(node, snapshot) ? { node, exact: false } : null;
}
