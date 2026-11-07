import { t } from "../../i18n";
import { PROJECT_NAME_MAX_LENGTH, normalizeProjectName } from "../../model/projectName";
import { store } from "../../state/store";
import { el } from "../dom";
import { field, section } from "../settingsControls";

export function projectSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(t("settings.projectTitle"), t("settings.projectNote"));
  const input = el("input", "input");
  input.type = "text";
  input.value = project.name;
  input.maxLength = PROJECT_NAME_MAX_LENGTH;
  input.setAttribute("aria-label", t("settings.projectName"));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener("change", () => {
    const current = store.project;
    if (!current) return;
    const name = normalizeProjectName(input.value, current.name);
    input.value = name;
    if (name === current.name) return;
    store.mutate((next) => {
      next.name = name;
    }, "change");
  });
  wrap.append(
    field(t("settings.projectName"), input),
    el("p", "settings-note", t("settings.fileNameNote")),
  );
  return wrap;
}
