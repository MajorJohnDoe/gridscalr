import { calloutLayout, cloudLabelLayout, textBoxLayout } from "../model/annotations";
import { makeId } from "../model/calibration";
import { expandRect, itemCenter, itemRotation, normalizeDegrees } from "../model/geometry";
import {
  addItem,
  ensureActiveLayer,
  findItem,
  itemIsLocked,
  layerLockedOnPage,
  layerVisibleOnPage,
} from "../model/layers";
import type { LabelBox, LabelMetrics } from "../model/label";
import type { LabelLayout } from "../model/labelLayout";
import { itemMetrics } from "../model/measure";
import {
  TEXT_FONT_STACK,
  TEXT_LINE_HEIGHT,
  clampTextSize,
  measureTextWidth,
  textItemLayout,
} from "../model/text";
import type { Layer, MarkupItem, Point, TextAlign, TextRun } from "../model/types";
import {
  applyRunStyle,
  reconcileRuns,
  runsEqual,
  runsFromItem,
  runsHaveFormatting,
  type RunStylePatch,
} from "../model/richText";
import { RichEditorController } from "./richEditor";
import { store } from "../state/store";
import { colorWithEyedropper } from "../ui/colorPicker";
import { icon } from "../ui/icons";
import { toast } from "../ui/toast";
import { rotatedAabb, roundTo } from "./geometry";
import { t } from "../i18n";

const FONT_STACK = TEXT_FONT_STACK;

/** Keeps the inline editor readable on both light and dark text colours. */
function editorSurface(color: string): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!match) return "rgba(255, 255, 255, 0.94)";
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((part) => part + part)
          .join("")
      : match[1];
  const value = Number.parseInt(hex, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.55 ? "rgba(12, 16, 18, 0.9)" : "rgba(255, 255, 255, 0.94)";
}

interface TextStyleSnapshot {
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  boxWidth?: number;
  boxHeight?: number;
  runs?: TextRun[];
}

export interface TextEditSession {
  mode: "text" | "textbox" | "cloud" | "callout";
  itemId: string | null;
  layerId: string | null;
  page: number;
  anchor: Point;
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  boxWidth?: number;
  boxHeight?: number;
  padding?: number;
  runs?: TextRun[];
  original?: TextStyleSnapshot;
  closing: boolean;
  container: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  richEditor: RichEditorController | null;
  strip: HTMLDivElement;
  resizeHandle: HTMLDivElement | null;
}

interface LabelEditSession {
  itemId: string;
  layerId: string;
  page: number;
  value: string;
  original: string | undefined;
  closing: boolean;
  container: HTMLDivElement;
  input: HTMLInputElement;
}

export interface LabelHit {
  layer: Layer;
  item: MarkupItem;
}

export interface EditorHost {
  host: HTMLElement;
  width(): number;
  toScreen(point: Point): Point;
  pageLabelLayouts(): Map<string, LabelLayout>;
  screenLabelBox(box: LabelBox, metrics: LabelMetrics): LabelBox;
  drawContent(): void;
  drawInteraction(): void;
}

/**
 * Owns the inline text and measurement-label editors. The canvas remains
 * responsible for page coordinates and rendering; this controller owns only
 * DOM editing state and persistence.
 */
export class CanvasEditorController {
  private readonly editorLayer: HTMLDivElement;
  private text: TextEditSession | null = null;
  private label: LabelEditSession | null = null;
  private editingItem: string | null = null;
  private editingLabel: string | null = null;

  constructor(private readonly host: EditorHost) {
    this.editorLayer = document.createElement("div");
    this.editorLayer.className = "canvas-editor-layer";
    host.host.append(this.editorLayer);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
  }

  get hasEditors(): boolean {
    return this.text !== null || this.label !== null;
  }

  get editingItemId(): string | null {
    return this.editingItem;
  }

  get editingLabelId(): string | null {
    return this.editingLabel;
  }

  get textSession(): TextEditSession | null {
    return this.text;
  }

  handleStoreChange(reason: string): void {
    if (!this.text && !this.label) return;
    if (reason === "view") {
      this.positionTextEditor();
      this.positionLabelEditor();
      return;
    }
    if (reason !== "selection" && reason !== "change" && reason !== "save") {
      this.cancelTextEdit();
      this.cancelLabelEdit();
    }
  }

  startNewText(point: Point): void {
    if (this.text) void this.commitTextEdit();
    const style = store.ui.style;
    this.beginTextEditSession({
      mode: "text",
      itemId: null,
      layerId: null,
      page: store.ui.page,
      anchor: point,
      text: "",
      color: style.color,
      fontSize: style.fontSize,
      rotation: 0,
      bold: false,
      italic: false,
      underline: false,
      align: "left",
    });
  }

  startTextEdit(item: MarkupItem, layer: Layer): void {
    if (itemIsLocked(item, layer)) {
      toast(t("editors.itemLocked"), "warning");
      return;
    }
    if (this.text) void this.commitTextEdit();
    const fontSize = clampTextSize(item.fontSize ?? 12);
    const rotation = normalizeDegrees(itemRotation(item));
    this.beginTextEditSession({
      mode: "text",
      itemId: item.id,
      layerId: layer.id,
      page: item.page,
      anchor: item.points[0] ?? { x: 0, y: 0 },
      text: item.text ?? "",
      color: item.color,
      fontSize,
      rotation,
      bold: item.textBold === true,
      italic: item.textItalic === true,
      underline: item.textUnderline === true,
      align: item.textAlign ?? "left",
      original: {
        text: item.text ?? "",
        color: item.color,
        fontSize,
        rotation,
        bold: item.textBold === true,
        italic: item.textItalic === true,
        underline: item.textUnderline === true,
        align: item.textAlign ?? "left",
      },
    });
  }

  startTextBoxEdit(item: MarkupItem, layer: Layer): void {
    if (itemIsLocked(item, layer)) {
      toast(t("editors.itemLocked"), "warning");
      return;
    }
    if (item.points.length < 2) return;
    if (this.text) void this.commitTextEdit();
    const rect = expandRect(item.points[0], item.points[1]);
    const fontSize = clampTextSize(item.fontSize ?? 12);
    const color = item.textColor ?? item.color;
    const align = item.textAlign ?? "left";
    const runs = runsFromItem(item);
    this.beginTextEditSession({
      mode: "textbox",
      itemId: item.id,
      layerId: layer.id,
      page: item.page,
      anchor: { x: rect.x, y: rect.y },
      text: item.text ?? "",
      color,
      fontSize,
      rotation: 0,
      bold: item.textBold === true,
      italic: item.textItalic === true,
      underline: item.textUnderline === true,
      align,
      boxWidth: rect.width,
      boxHeight: rect.height,
      padding: item.padding ?? 4,
      runs,
      original: {
        text: item.text ?? "",
        color,
        fontSize,
        rotation: 0,
        bold: item.textBold === true,
        italic: item.textItalic === true,
        underline: item.textUnderline === true,
        align,
        boxWidth: rect.width,
        boxHeight: rect.height,
        runs,
      },
    });
  }

  startCloudTextEdit(item: MarkupItem, layer: Layer): void {
    if (itemIsLocked(item, layer)) {
      toast(t("editors.itemLocked"), "warning");
      return;
    }
    if (this.text) void this.commitTextEdit();
    const label = cloudLabelLayout(item);
    const fontSize = clampTextSize(item.fontSize ?? 12);
    const color = item.textColor ?? "#f7fbfc";
    const align = item.textAlign ?? "center";
    this.beginTextEditSession({
      mode: "cloud",
      itemId: item.id,
      layerId: layer.id,
      page: item.page,
      anchor: label?.center ?? itemCenter(item),
      text: item.text ?? "",
      color,
      fontSize,
      rotation: 0,
      bold: item.textBold === true,
      italic: item.textItalic === true,
      underline: item.textUnderline === true,
      align,
      boxWidth: item.textBoxWidth,
      boxHeight: item.textBoxHeight,
      original: {
        text: item.text ?? "",
        color,
        fontSize,
        rotation: 0,
        bold: item.textBold === true,
        italic: item.textItalic === true,
        underline: item.textUnderline === true,
        align,
        boxWidth: item.textBoxWidth,
        boxHeight: item.textBoxHeight,
      },
    });
  }

  startCalloutTextEdit(item: MarkupItem, layer: Layer): void {
    if (itemIsLocked(item, layer)) {
      toast(t("editors.itemLocked"), "warning");
      return;
    }
    if (this.text) void this.commitTextEdit();
    const layout = calloutLayout(item);
    const fontSize = clampTextSize(item.fontSize ?? 12);
    const color = item.textColor ?? "#f7fbfc";
    const align = item.textAlign ?? "center";
    this.beginTextEditSession({
      mode: "callout",
      itemId: item.id,
      layerId: layer.id,
      page: item.page,
      anchor: layout.center,
      text: item.text ?? "",
      color,
      fontSize,
      rotation: 0,
      bold: item.textBold === true,
      italic: item.textItalic === true,
      underline: item.textUnderline === true,
      align,
      boxWidth: item.textBoxWidth,
      boxHeight: item.textBoxHeight,
      original: {
        text: item.text ?? "",
        color,
        fontSize,
        rotation: 0,
        bold: item.textBold === true,
        italic: item.textItalic === true,
        underline: item.textUnderline === true,
        align,
        boxWidth: item.textBoxWidth,
        boxHeight: item.textBoxHeight,
      },
    });
  }

  startLabelEdit(hit: LabelHit): void {
    if (itemIsLocked(hit.item, hit.layer)) {
      toast(t("editors.itemLocked"), "warning");
      return;
    }
    if (this.text) void this.commitTextEdit();
    const container = document.createElement("div");
    container.className = "canvas-label-editor";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "canvas-label-editor-input";
    input.value = hit.item.label ?? "";
    input.placeholder = t("editors.addLabel");
    input.setAttribute("aria-label", t("editors.measurementLabel"));
    const hint = document.createElement("span");
    hint.className = "canvas-label-editor-hint";
    const project = store.project;
    const metrics = project ? itemMetrics(hit.item, project) : null;
    hint.textContent = metrics
      ? `${metrics.primary}${metrics.secondary ? ` · ${metrics.secondary}` : ""}`
      : "";
    container.append(input, hint);
    const edit: LabelEditSession = {
      itemId: hit.item.id,
      layerId: hit.layer.id,
      page: hit.item.page,
      value: hit.item.label ?? "",
      original: hit.item.label,
      closing: false,
      container,
      input,
    };
    this.label = edit;
    this.editingLabel = hit.item.id;
    this.editorLayer.append(container);
    this.positionLabelEditor();

    input.addEventListener("input", () => {
      edit.value = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        void this.commitLabelEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelLabelEdit();
      }
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!this.label || this.label !== edit || edit.closing) return;
        const active = document.activeElement;
        if (active && this.editorLayer.contains(active)) return;
        void this.commitLabelEdit();
      }, 0);
    });
    this.host.drawContent();
    this.host.drawInteraction();
    window.requestAnimationFrame(() => {
      if (this.label !== edit) return;
      input.focus({ preventScroll: true });
      input.select();
    });
  }

  positionTextEditor(): void {
    const edit = this.text;
    if (!edit || edit.closing) return;
    const zoom = store.ui.zoom;
    const anchor = this.host.toScreen(edit.anchor);
    const input = edit.richEditor?.element ?? edit.textarea;
    let left: number;
    let top: number;
    let width: number;
    let height: number;
    let rotation = edit.rotation;
    let lineHeight: number;
    let fontSize: number;
    if (edit.mode === "textbox") {
      width = Math.max(20, (edit.boxWidth ?? 100) * zoom);
      height = Math.max(16, (edit.boxHeight ?? 40) * zoom);
      left = anchor.x;
      top = anchor.y;
      lineHeight = Math.max(1, edit.fontSize * TEXT_LINE_HEIGHT * zoom);
      fontSize = Math.max(1, edit.fontSize * zoom);
      rotation = 0;
      const pad = Math.max(1, (edit.padding ?? 4) * zoom);
      input.style.padding = `${pad}px`;
      input.style.whiteSpace = "pre-wrap";
    } else if (edit.mode === "cloud" || edit.mode === "callout") {
      const layout = textBoxLayout(edit.text, edit.fontSize, edit.boxWidth, edit.boxHeight);
      width = Math.max(40, layout.width * zoom);
      height = Math.max(20, layout.height * zoom);
      left = anchor.x - width / 2;
      top = anchor.y - height / 2;
      lineHeight = layout.lineHeight * zoom;
      fontSize = Math.max(1, layout.fontSize * zoom);
      rotation = 0;
      const horizontalPadding = Math.max(2, layout.padding * zoom);
      const verticalPadding = Math.max(2, (height - layout.lines.length * lineHeight) / 2);
      input.style.padding = `${verticalPadding}px ${horizontalPadding}px`;
      input.style.whiteSpace = "pre-wrap";
    } else {
      const layout = textItemLayout({ text: edit.text, fontSize: edit.fontSize }, measureTextWidth);
      width = Math.max(52, layout.width * zoom + 4);
      height = Math.max(layout.lineHeight * zoom + 4, layout.height * zoom + 4);
      left = anchor.x - 2;
      top = anchor.y - 2;
      lineHeight = layout.lineHeight * zoom;
      fontSize = Math.max(1, layout.fontSize * zoom);
      input.style.padding = "2px";
      input.style.whiteSpace = "pre";
    }
    input.style.left = `${left}px`;
    input.style.top = `${top}px`;
    input.style.width = `${width}px`;
    input.style.height = `${height}px`;
    input.style.fontSize = `${fontSize}px`;
    input.style.lineHeight = `${lineHeight}px`;
    input.style.fontFamily = FONT_STACK;
    input.style.color = edit.color;
    input.style.background = editorSurface(edit.color);
    input.style.transform = `rotate(${rotation}deg)`;
    input.style.transformOrigin = "center";
    if (edit.resizeHandle) {
      edit.resizeHandle.style.left = `${left + width - 7}px`;
      edit.resizeHandle.style.top = `${top + height - 7}px`;
    }

    const box = rotatedAabb(left, top, width, height, rotation);
    const stripWidth = edit.strip.offsetWidth || 270;
    const stripLeft = Math.max(8, Math.min(this.host.width() - stripWidth - 8, box.minX));
    let stripTop = box.minY - 44;
    if (stripTop < 8) stripTop = box.maxY + 8;
    edit.strip.style.left = `${stripLeft}px`;
    edit.strip.style.top = `${Math.max(8, stripTop)}px`;
  }

  positionLabelEditor(): void {
    const edit = this.label;
    if (!edit || edit.closing || !store.project) return;
    const found = findItem(store.project, edit.itemId);
    if (!found) return;
    const layout = this.host.pageLabelLayouts().get(found.item.id);
    if (!layout) return;
    const box = this.host.screenLabelBox(layout.box, layout.metrics);
    const width = Math.max(150, box.width + 42);
    edit.container.style.left = `${Math.max(6, Math.min(this.host.width() - width - 6, box.x - 20))}px`;
    edit.container.style.top = `${Math.max(6, box.y)}px`;
    edit.container.style.width = `${width}px`;
    edit.container.style.minHeight = `${Math.max(28, box.height)}px`;
  }

  commitActiveEditors(): void {
    if (this.text && !this.text.closing) void this.commitTextEdit();
    if (this.label && !this.label.closing) void this.commitLabelEdit();
  }

  destroy(): void {
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.text?.container.remove();
    this.label?.container.remove();
    this.text = null;
    this.label = null;
    this.editingItem = null;
    this.editingLabel = null;
    this.editorLayer.remove();
  }

  private onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.text && !this.label) return;
    const target = event.target;
    if (target instanceof Node && this.editorLayer.contains(target)) return;
    this.commitActiveEditors();
  };

  private beginTextEditSession(
    session: Omit<
      TextEditSession,
      "closing" | "container" | "textarea" | "richEditor" | "strip" | "resizeHandle"
    >,
  ): void {
    this.cancelLabelEdit();
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
        if (!richEditor || !this.text || this.text.richEditor !== richEditor) return;
        this.text.text = richEditor.getText();
        this.positionTextEditor();
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
    colorInput.value = session.color;
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
    this.text = edit;
    this.editingItem = edit.itemId;
    this.editorLayer.append(container);

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
        this.positionTextEditor();
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
        if (this.text !== edit) return;
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(start, end);
      });
      this.positionTextEditor();
      return true;
    };

    const syncStyle = () => {
      const target = edit.richEditor?.element ?? textarea;
      target.style.color = edit.color;
      target.style.fontWeight = edit.bold ? "700" : "400";
      target.style.fontStyle = edit.italic ? "italic" : "normal";
      target.style.textDecoration = edit.underline ? "underline" : "none";
      target.style.textAlign = edit.align;
      edit.richEditor?.setMetrics(
        {
          fontSize: edit.fontSize,
          color: edit.color,
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
      edit.color = colorInput.value;
      edit.rotation = normalizeDegrees(Number(rotationInput.value));
      syncStyle();
      this.positionTextEditor();
    };
    const toggleRunStyle = (key: "bold" | "italic" | "underline") => {
      if (edit.richEditor && edit.richEditor.hasSelection()) {
        if (edit.richEditor.toggle(key)) {
          edit.text = edit.richEditor.getText();
          this.positionTextEditor();
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
      this.positionTextEditor();
    });
    colorInput.addEventListener("input", () => {
      if (applyToSelection({ color: colorInput.value })) return;
      edit.color = colorInput.value;
      syncStyle();
      this.positionTextEditor();
    });
    rotationInput.addEventListener("input", refresh);
    if (edit.richEditor) {
      const rich = edit.richEditor;
      rich.element.addEventListener("input", () => {
        edit.text = rich.getText();
        this.positionTextEditor();
      });
      rich.element.addEventListener("keydown", (event) => {
        if (event.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.cancelTextEdit();
        } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.stopPropagation();
          void this.commitTextEdit();
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          rich.insertLineBreak();
          edit.text = rich.getText();
          this.positionTextEditor();
        }
      });
      rich.element.addEventListener("blur", () => {
        window.setTimeout(() => {
          if (!this.text || this.text !== edit || edit.closing) return;
          const active = document.activeElement;
          if (active && this.editorLayer.contains(active)) return;
          void this.commitTextEdit();
        }, 0);
      });
    } else {
      textarea.addEventListener("input", () => {
        edit.text = textarea.value;
        captureSelection();
        this.positionTextEditor();
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
        this.cancelTextEdit();
      } else if (event.key === "Enter" && !event.shiftKey) {
        if (edit.mode === "textbox" && !event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        void this.commitTextEdit();
      }
    });
    textarea.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!this.text || this.text !== edit || edit.closing) return;
        const active = document.activeElement;
        if (active && this.editorLayer.contains(active)) return;
        void this.commitTextEdit();
      }, 0);
    });
    doneButton.addEventListener("click", () => void this.commitTextEdit());
    cancelButton.addEventListener("click", () => this.cancelTextEdit());
    if (edit.resizeHandle) {
      this.bindTextEditorResize(edit, edit.resizeHandle);
    }

    syncStyle();
    this.positionTextEditor();
    this.host.drawContent();
    this.host.drawInteraction();
    window.requestAnimationFrame(() => {
      if (this.text !== edit) return;
      if (edit.richEditor) {
        edit.richEditor.focusEnd();
        return;
      }
      textarea.focus({ preventScroll: true });
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }

  private bindTextEditorResize(edit: TextEditSession, handle: HTMLDivElement): void {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const zoom = Math.max(0.01, store.ui.zoom);
      const startX = event.clientX;
      const startY = event.clientY;
      const current = textBoxLayout(edit.text, edit.fontSize, edit.boxWidth, edit.boxHeight);
      const startWidth = edit.boxWidth ?? current.width;
      const startHeight = edit.boxHeight ?? current.height;
      handle.setPointerCapture(event.pointerId);

      const move = (moveEvent: PointerEvent) => {
        edit.boxWidth = Math.max(
          20,
          Math.min(2000, startWidth + ((moveEvent.clientX - startX) * 2) / zoom),
        );
        edit.boxHeight = Math.max(
          15,
          Math.min(2000, startHeight + ((moveEvent.clientY - startY) * 2) / zoom),
        );
        this.positionTextEditor();
        this.host.drawContent();
      };
      const finish = (endEvent: PointerEvent) => {
        if (handle.hasPointerCapture(endEvent.pointerId)) {
          handle.releasePointerCapture(endEvent.pointerId);
        }
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });
  }

  private closeTextEditor(): void {
    if (!this.text) return;
    this.text.container.remove();
    this.text = null;
    this.editingItem = null;
    this.host.drawContent();
    this.host.drawInteraction();
  }

  private async commitTextEdit(): Promise<void> {
    const edit = this.text;
    if (!edit || edit.closing) return;
    edit.closing = true;
    const project = store.project;
    if (!project) {
      this.closeTextEditor();
      return;
    }
    const value = edit.richEditor ? edit.richEditor.getText() : edit.text;
    if (edit.itemId) {
      const found = findItem(project, edit.itemId);
      if (!found || itemIsLocked(found.item, found.layer)) {
        this.closeTextEditor();
        return;
      }
      if (edit.mode === "textbox") {
        const original = edit.original!;
        const runs = edit.richEditor
          ? edit.richEditor.getRuns()
          : reconcileRuns(edit.runs ?? [{ text: value }], value);
        const changed =
          value !== original.text ||
          edit.color !== original.color ||
          Math.abs(edit.fontSize - original.fontSize) > 0.001 ||
          edit.bold !== original.bold ||
          edit.italic !== original.italic ||
          edit.underline !== original.underline ||
          edit.align !== original.align ||
          !runsEqual(runs, original.runs);
        this.closeTextEditor();
        if (!changed) return;
        store.mutate((project) => {
          const item = findItem(project, edit.itemId!)?.item;
          if (!item) return;
          item.text = value;
          item.textColor = edit.color;
          item.fontSize = clampTextSize(edit.fontSize);
          if (edit.bold) item.textBold = true;
          else delete item.textBold;
          if (edit.italic) item.textItalic = true;
          else delete item.textItalic;
          if (edit.underline) item.textUnderline = true;
          else delete item.textUnderline;
          if (edit.align === "left") delete item.textAlign;
          else item.textAlign = edit.align;
          if (runsHaveFormatting(runs, item)) item.runs = runs;
          else delete item.runs;
          item.updatedAt = new Date().toISOString();
        }, "change");
        return;
      }
      if (edit.mode === "cloud" || edit.mode === "callout") {
        const original = edit.original!;
        const changed =
          value !== original.text ||
          edit.color !== original.color ||
          Math.abs(edit.fontSize - original.fontSize) > 0.001 ||
          edit.bold !== original.bold ||
          edit.italic !== original.italic ||
          edit.underline !== original.underline ||
          edit.align !== original.align ||
          edit.boxWidth !== original.boxWidth ||
          edit.boxHeight !== original.boxHeight;
        this.closeTextEditor();
        if (!changed) return;
        store.mutate((project) => {
          const item = findItem(project, edit.itemId!)?.item;
          if (!item) return;
          item.text = value.trim() || t("reference.revision");
          item.textColor = edit.color;
          item.fontSize = clampTextSize(edit.fontSize);
          if (edit.bold) item.textBold = true;
          else delete item.textBold;
          if (edit.italic) item.textItalic = true;
          else delete item.textItalic;
          if (edit.underline) item.textUnderline = true;
          else delete item.textUnderline;
          if (edit.align === "center") delete item.textAlign;
          else item.textAlign = edit.align;
          if (edit.boxWidth) item.textBoxWidth = edit.boxWidth;
          else delete item.textBoxWidth;
          if (edit.boxHeight) item.textBoxHeight = edit.boxHeight;
          else delete item.textBoxHeight;
          item.updatedAt = new Date().toISOString();
        }, "change");
        return;
      }
      const original = edit.original!;
      const rotation = normalizeDegrees(edit.rotation);
      const changed =
        value !== original.text ||
        edit.color !== original.color ||
        Math.abs(edit.fontSize - original.fontSize) > 0.001 ||
        Math.abs(rotation - normalizeDegrees(original.rotation)) > 0.001 ||
        edit.bold !== original.bold ||
        edit.italic !== original.italic ||
        edit.underline !== original.underline ||
        edit.align !== original.align;
      this.closeTextEditor();
      if (!changed) return;
      store.mutate((project) => {
        const item = findItem(project, edit.itemId!)?.item;
        if (!item) return;
        item.text = value;
        item.color = edit.color;
        item.fontSize = clampTextSize(edit.fontSize);
        if (edit.bold) item.textBold = true;
        else delete item.textBold;
        if (edit.italic) item.textItalic = true;
        else delete item.textItalic;
        if (edit.underline) item.textUnderline = true;
        else delete item.textUnderline;
        if (edit.align === "left") delete item.textAlign;
        else item.textAlign = edit.align;
        if (rotation === 0) delete item.rotation;
        else item.rotation = rotation;
        item.updatedAt = new Date().toISOString();
      }, "change");
      return;
    }

    if (!value.trim()) {
      this.closeTextEditor();
      return;
    }
    const active = project.layers.find(
      (layer) => layer.id === project.activeLayerId && layer.kind === "draw",
    );
    if (
      active &&
      (!layerVisibleOnPage(active, edit.page) || layerLockedOnPage(active, edit.page))
    ) {
      toast(
        t("canvas.layerUnavailable", {
          name: active.name,
          state: layerLockedOnPage(active, edit.page)
            ? t("canvas.stateLocked")
            : t("canvas.stateHidden"),
        }),
        "warning",
      );
      this.closeTextEditor();
      return;
    }
    const rotation = normalizeDegrees(edit.rotation);
    let layerId = "";
    let itemId = "";
    this.closeTextEditor();
    store.mutate((project) => {
      const layer = ensureActiveLayer(project, "draw", edit.page);
      const now = new Date().toISOString();
      const item: MarkupItem = {
        id: makeId("item"),
        page: edit.page,
        kind: "text",
        points: [{ ...edit.anchor }],
        color: edit.color,
        strokeWidth: 2,
        text: value,
        fontSize: clampTextSize(edit.fontSize),
        textBold: edit.bold ? true : undefined,
        textItalic: edit.italic ? true : undefined,
        textUnderline: edit.underline ? true : undefined,
        textAlign: edit.align === "left" ? undefined : edit.align,
        rotation: rotation === 0 ? undefined : rotation,
        scale: null,
        createdAt: now,
        updatedAt: now,
      };
      addItem(project, layer.id, item);
      layerId = layer.id;
      itemId = item.id;
    }, "change");
    if (layerId && itemId) {
      store.setSelection({ layerId, itemId });
      store.setTool("select");
    }
  }

  private cancelTextEdit(): void {
    if (!this.text) return;
    this.text.closing = true;
    this.closeTextEditor();
  }

  private closeLabelEditor(): void {
    if (!this.label) return;
    this.label.container.remove();
    this.label = null;
    this.editingLabel = null;
    this.host.drawContent();
    this.host.drawInteraction();
  }

  private async commitLabelEdit(): Promise<void> {
    const edit = this.label;
    if (!edit || edit.closing) return;
    edit.closing = true;
    const value = edit.value.trim();
    const original = (edit.original ?? "").trim();
    this.closeLabelEditor();
    if (value === original) return;
    store.mutate((project) => {
      const item = findItem(project, edit.itemId)?.item;
      if (!item) return;
      item.label = value || undefined;
      item.updatedAt = new Date().toISOString();
    }, "change");
  }

  private cancelLabelEdit(): void {
    if (!this.label) return;
    this.label.closing = true;
    this.closeLabelEditor();
  }
}
