import { normalizeDegrees } from "../../model/geometry";
import { clampTextSize } from "../../model/text";
import { RichEditorController } from "../richEditor";
import { normalizeColor } from "../../model/color";
import type { TextAlign } from "../../model/types";
import { applyRunStyle, reconcileRuns, type RunStylePatch } from "../../model/richText";
import { store } from "../../state/store";
import { colorInputValue, setColorInput } from "../../ui/colorInput";
import { colorWithEyedropper } from "../../ui/colorPicker";
import { icon } from "../../ui/icons";
import { roundTo } from "../geometry";
import { t } from "../../i18n";
import { cancelTextEdit, type EditorState, type TextEditSession } from "./shared";
import { cancelLabelEdit } from "./labels";
import { commitTextEdit } from "./textCommit";
import { bindTextEditorResize } from "./textResize";
import { positionTextEditor } from "./textPosition";

export function beginTextEditSession(
  state: EditorState,
  session: Omit<
    TextEditSession,
    "closing" | "container" | "textarea" | "richEditor" | "strip" | "resizeHandle"
  >,
): void {
  cancelLabelEdit(state);
  const container = document.createElement("div");
  container.className = "canvas-text-editor";
  const textarea = document.createElement("textarea");
  textarea.className = "canvas-text-editor-input";
  textarea.value = session.text;
  textarea.placeholder =
    session.mode === "cloud"
      ? t("editors.cloudText")
      : session.mode === "callout"
        ? t("editors.calloutText")
        : t("editors.typeNote");
  textarea.wrap = session.mode === "text" ? "off" : "soft";
  textarea.spellcheck = false;
  textarea.setAttribute("aria-label", t("editors.textAnnotation"));
  const textDefaults = {
    fontSize: session.fontSize,
    color: session.color,
    bold: session.bold,
    italic: session.italic,
    underline: session.underline,
  };
  let richEditor: RichEditorController | null = null;
  if (session.mode === "textbox") {
    const initialRuns = session.runs ?? [
      {
        text: session.text,
        bold: session.bold,
        italic: session.italic,
        underline: session.underline,
        size: session.fontSize,
        color: session.color,
      },
    ];
    richEditor = new RichEditorController(initialRuns, textDefaults, store.ui.zoom, () => {
      if (!richEditor || !state.text || state.text.richEditor !== richEditor) return;
      state.text.text = richEditor.getText();
      positionTextEditor(state);
    });
  }
  const strip = document.createElement("div");
  strip.className = "inline-style-strip";

  const sizeField = document.createElement("label");
  sizeField.className = "inline-style-field";
  sizeField.title = t("editors.fontSizePoints");
  const sizeLabel = document.createElement("span");
  sizeLabel.textContent = t("editors.size");
  const sizeInput = document.createElement("input");
  sizeInput.type = "number";
  sizeInput.min = "0.5";
  sizeInput.max = "300";
  sizeInput.step = "0.5";
  sizeInput.value = String(roundTo(session.fontSize, 2));
  sizeInput.className = "inline-size-input";
  sizeField.append(sizeLabel, sizeInput);

  const colorField = document.createElement("label");
  colorField.className = "inline-style-field inline-color-field";
  colorField.title = t("editors.textColour");
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  setColorInput(colorInput, session.color, store.ui.style.color);
  colorInput.setAttribute("aria-label", t("editors.textColour"));
  colorField.append(colorWithEyedropper(colorInput, t("editors.textColour")));

  const boldButton = document.createElement("button");
  boldButton.type = "button";
  boldButton.className = "inline-strip-button is-toggle is-bold";
  boldButton.title = t("editors.bold");
  boldButton.setAttribute("aria-label", t("editors.bold"));
  boldButton.textContent = "B";
  const italicButton = document.createElement("button");
  italicButton.type = "button";
  italicButton.className = "inline-strip-button is-toggle is-italic";
  italicButton.title = t("editors.italic");
  italicButton.setAttribute("aria-label", t("editors.italic"));
  italicButton.textContent = "I";
  const underlineButton = document.createElement("button");
  underlineButton.type = "button";
  underlineButton.className = "inline-strip-button is-toggle is-underline";
  underlineButton.title = t("editors.underline");
  underlineButton.setAttribute("aria-label", t("editors.underline"));
  underlineButton.textContent = "U";
  const alignGroup = document.createElement("div");
  alignGroup.className = "inline-toggle-group";
  alignGroup.setAttribute("role", "group");
  alignGroup.setAttribute("aria-label", t("editors.textAlignment"));
  const alignButtons: Array<{ align: TextAlign; button: HTMLButtonElement }> = [];
  for (const align of ["left", "center", "right"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inline-strip-button is-toggle is-align";
    const alignLabel =
      align === "left"
        ? t("canvas.alignLeft")
        : align === "right"
          ? t("canvas.alignRight")
          : t("canvas.alignCenter");
    button.title = t("canvas.align", { align: alignLabel });
    button.setAttribute("aria-label", t("canvas.alignText", { align: alignLabel }));
    button.innerHTML = icon(`align${align[0].toUpperCase()}${align.slice(1)}`, 14);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      edit.align = align;
      refresh();
    });
    alignGroup.append(button);
    alignButtons.push({ align, button });
  }
  boldButton.addEventListener("mousedown", (event) => event.preventDefault());
  italicButton.addEventListener("mousedown", (event) => event.preventDefault());
  underlineButton.addEventListener("mousedown", (event) => event.preventDefault());
  boldButton.addEventListener("click", () => toggleRunStyle("bold"));
  italicButton.addEventListener("click", () => toggleRunStyle("italic"));
  underlineButton.addEventListener("click", () => toggleRunStyle("underline"));

  const rotationField = document.createElement("label");
  rotationField.className = "inline-style-field";
  rotationField.title = t("editors.rotationDegrees");
  const rotationLabel = document.createElement("span");
  rotationLabel.textContent = t("editors.angle");
  const rotationInput = document.createElement("input");
  rotationInput.type = "number";
  rotationInput.min = "-360";
  rotationInput.max = "360";
  rotationInput.step = "1";
  rotationInput.value = String(roundTo(session.rotation, 1));
  rotationInput.className = "inline-angle-input";
  rotationField.append(rotationLabel, rotationInput);
  if (session.mode !== "text") {
    rotationField.hidden = true;
    rotationField.style.display = "none";
  }

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "inline-strip-button is-quiet";
  cancelButton.textContent = t("common.cancel");
  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.className = "inline-strip-button is-primary";
  doneButton.textContent = t("common.done");
  strip.append(sizeField, colorField, boldButton, italicButton, underlineButton, alignGroup);
  if (session.mode !== "textbox") strip.append(rotationField);
  strip.append(cancelButton, doneButton);
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "canvas-text-editor-resize";
  resizeHandle.title = t("editors.resizeTextBox");
  resizeHandle.setAttribute("aria-hidden", "true");
  const resizable = session.mode === "cloud" || session.mode === "callout";
  if (resizable) container.append(resizeHandle);
  container.append(richEditor?.element ?? textarea, strip);

  const edit: TextEditSession = {
    ...session,
    closing: false,
    container,
    textarea,
    richEditor,
    strip,
    resizeHandle: resizable ? resizeHandle : null,
  };
  state.text = edit;
  state.editingItem = edit.itemId;
  state.editorLayer.append(container);

  let selection = { start: textarea.selectionStart, end: textarea.selectionEnd };
  const captureSelection = () => {
    selection = { start: textarea.selectionStart, end: textarea.selectionEnd };
  };
  const hasRunSelection = () =>
    edit.mode === "textbox" &&
    (edit.richEditor ? edit.richEditor.hasSelection() : selection.start !== selection.end) &&
    !edit.closing;

  const applyToSelection = (patch: RunStylePatch): boolean => {
    if (!hasRunSelection()) return false;
    if (edit.richEditor) {
      if (!edit.richEditor.applyStyle(patch)) return false;
      edit.text = edit.richEditor.getText();
      positionTextEditor(state);
      return true;
    }
    edit.runs = applyRunStyle(
      reconcileRuns(edit.runs ?? [{ text: textarea.value }], textarea.value),
      selection.start,
      selection.end,
      patch,
    );
    textarea.value = (edit.runs ?? []).map((run) => run.text).join("");
    edit.text = textarea.value;
    const start = selection.start;
    const end = selection.end;
    window.requestAnimationFrame(() => {
      if (state.text !== edit) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start, end);
    });
    positionTextEditor(state);
    return true;
  };

  const syncStyle = () => {
    const target = edit.richEditor?.element ?? textarea;
    const color = normalizeColor(edit.color, store.ui.style.color);
    target.style.color = color;
    target.style.fontWeight = edit.bold ? "700" : "400";
    target.style.fontStyle = edit.italic ? "italic" : "normal";
    target.style.textDecoration = edit.underline ? "underline" : "none";
    target.style.textAlign = edit.align;
    edit.richEditor?.setMetrics(
      {
        fontSize: edit.fontSize,
        color,
        bold: edit.bold,
        italic: edit.italic,
        underline: edit.underline,
      },
      store.ui.zoom,
    );
    boldButton.setAttribute("aria-pressed", edit.bold ? "true" : "false");
    italicButton.setAttribute("aria-pressed", edit.italic ? "true" : "false");
    underlineButton.setAttribute("aria-pressed", edit.underline ? "true" : "false");
    for (const entry of alignButtons) {
      entry.button.setAttribute("aria-pressed", edit.align === entry.align ? "true" : "false");
    }
  };
  const refresh = () => {
    edit.text = edit.richEditor ? edit.richEditor.getText() : textarea.value;
    edit.fontSize = clampTextSize(Number(sizeInput.value));
    edit.rotation = normalizeDegrees(Number(rotationInput.value));
    syncStyle();
    positionTextEditor(state);
  };
  const toggleRunStyle = (key: "bold" | "italic" | "underline") => {
    if (edit.richEditor && edit.richEditor.hasSelection()) {
      if (edit.richEditor.toggle(key)) {
        edit.text = edit.richEditor.getText();
        positionTextEditor(state);
      }
      return;
    }
    edit[key] = !edit[key];
    refresh();
  };
  sizeInput.addEventListener("input", () => {
    const size = clampTextSize(Number(sizeInput.value));
    if (applyToSelection({ size })) return;
    edit.fontSize = size;
    syncStyle();
    positionTextEditor(state);
  });
  colorInput.addEventListener("input", () => {
    const color = colorInputValue(colorInput, edit.color);
    if (applyToSelection({ color })) return;
    edit.color = color;
    syncStyle();
    positionTextEditor(state);
  });
  rotationInput.addEventListener("input", refresh);
  if (edit.richEditor) {
    const rich = edit.richEditor;
    rich.element.addEventListener("input", () => {
      edit.text = rich.getText();
      positionTextEditor(state);
    });
    rich.element.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelTextEdit(state);
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        void commitTextEdit(state);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        rich.insertLineBreak();
        edit.text = rich.getText();
        positionTextEditor(state);
      }
    });
    rich.element.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!state.text || state.text !== edit || edit.closing) return;
        const active = document.activeElement;
        if (active && state.editorLayer.contains(active)) return;
        void commitTextEdit(state);
      }, 0);
    });
  } else {
    textarea.addEventListener("input", () => {
      edit.text = textarea.value;
      captureSelection();
      positionTextEditor(state);
    });
    for (const eventName of ["select", "keyup", "mouseup", "blur"] as const) {
      textarea.addEventListener(eventName, captureSelection);
    }
  }
  textarea.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelTextEdit(state);
    } else if (event.key === "Enter" && !event.shiftKey) {
      if (edit.mode === "textbox" && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      void commitTextEdit(state);
    }
  });
  textarea.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!state.text || state.text !== edit || edit.closing) return;
      const active = document.activeElement;
      if (active && state.editorLayer.contains(active)) return;
      void commitTextEdit(state);
    }, 0);
  });
  doneButton.addEventListener("click", () => void commitTextEdit(state));
  cancelButton.addEventListener("click", () => cancelTextEdit(state));
  if (edit.resizeHandle) {
    bindTextEditorResize(state, edit, edit.resizeHandle);
  }

  syncStyle();
  positionTextEditor(state);
  state.host.drawContent();
  state.host.drawInteraction();
  window.requestAnimationFrame(() => {
    if (state.text !== edit) return;
    if (edit.richEditor) {
      edit.richEditor.focusEnd();
      return;
    }
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  });
}
