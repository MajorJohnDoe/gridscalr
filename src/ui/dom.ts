export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(
  className: string,
  label: string,
  onClick?: (event: MouseEvent) => void,
): HTMLButtonElement {
  const node = el("button", className);
  node.type = "button";
  node.title = label;
  node.setAttribute("aria-label", label);
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

export function iconButton(
  iconMarkup: string,
  label: string,
  onClick?: (event: MouseEvent) => void,
  className = "icon-btn",
): HTMLButtonElement {
  const node = button(className, label, onClick);
  node.innerHTML = iconMarkup;
  return node;
}

export function option(value: string, label: string, selected = false): HTMLOptionElement {
  const node = el("option");
  node.value = value;
  node.textContent = label;
  node.selected = selected;
  return node;
}

export function setPressed(node: HTMLElement, pressed: boolean): void {
  node.classList.toggle("is-active", pressed);
  node.setAttribute("aria-pressed", String(pressed));
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: number | undefined;
  return ((...args: never[]) => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  }) as T;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}
