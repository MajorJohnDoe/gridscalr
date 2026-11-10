import { normalizeProjectName } from "../model/projectName";
import { store } from "../state/store";

/** Inline project-name editing in the title row. */
export function beginProjectRename(name: HTMLElement): void {
  const project = store.project;
  if (!project || name.isContentEditable) return;
  const original = project.name;
  let finished = false;
  const finish = (commit: boolean) => {
    if (finished) return;
    finished = true;
    name.contentEditable = "false";
    name.classList.remove("is-editing");
    name.removeEventListener("keydown", onKey);
    name.removeEventListener("blur", onBlur);
    const value = normalizeProjectName(name.textContent ?? "", original);
    if (!commit || value === original) {
      name.textContent = original;
      return;
    }
    store.mutate((current) => {
      current.name = value;
    }, "change");
  };
  const onBlur = () => finish(true);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  };
  name.contentEditable = "plaintext-only";
  name.classList.add("is-editing");
  name.textContent = original;
  name.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(name);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  name.addEventListener("keydown", onKey);
  name.addEventListener("blur", onBlur);
}
