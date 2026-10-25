import {
  calloutLayout,
  cloudLabelLayout,
  textBoxLayout,
} from "../model/annotations";
import { makeId } from "../model/calibration";
import {
  itemCenter,
  itemRotation,
  normalizeDegrees,
} from "../model/geometry";
import {
  addItem,
  ensureActiveLayer,
  findItem,
  itemIsLocked,
} from "../model/layers";
import type { LabelBox, LabelMetrics } from "../model/label";
import type { LabelLayout } from "../model/labelLayout";
import { itemMetrics } from "../model/measure";
import {
  TEXT_FONT_STACK,
  clampTextSize,
  measureTextWidth,
  textItemLayout,
} from "../model/text";
import type { Layer, MarkupItem, Point, TextAlign } from "../model/types";
import { store } from "../state/store";
import { icon } from "../ui/icons";
import { toast } from "../ui/toast";
import { rotatedAabb, roundTo } from "./geometry";

const FONT_STACK = TEXT_FONT_STACK;

interface TextStyleSnapshot {
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  bold: boolean;
  underline: boolean;
  align: TextAlign;
  boxWidth?: number;
  boxHeight?: number;
}

export interface TextEditSession {
  mode: "text" | "cloud" | "callout";
  itemId: string | null;
  layerId: string | null;
  page: number;
  anchor: Point;
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  bold: boolean;
  underline: boolean;
  align: TextAlign;
  boxWidth?: number;
  boxHeight?: number;
  original?: TextStyleSnapshot;
  closing: boolean;
  container: HTMLDivElement;
  textarea: HTMLTextAreaElement;
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
      underline: false,
      align: "left",
    });
  }

  startTextEdit(item: MarkupItem, layer: Layer): void {
    if (itemIsLocked(item, layer)) {
      toast("This item is locked.", "warning");
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
      underline: item.textUnderline === true,
      align: item.textAlign ?? "left",
      original: {
        text: item.text ?? "",
        color: item.color,
        fontSize,
        rotation,
        bold: item.textBold === true,
        underline: item.textUnderline === true,
        align: item.textAlign ?? "left",
      },
    });
  }

  startCloudTextEdit(item: MarkupItem, layer: Layer): void {
    if (itemIsLocked(item, layer)) {
      toast("This item is locked.", "warning");
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
        underline: item.textUnderline === true,
        align,
        boxWidth: item.textBoxWidth,
        boxHeight: item.textBoxHeight,
      },
    });
  }

  startCalloutTextEdit(item: MarkupItem, layer: Layer): void {
    if (itemIsLocked(item, layer)) {
      toast("This item is locked.", "warning");
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
        underline: item.textUnderline === true,
        align,
        boxWidth: item.textBoxWidth,
        boxHeight: item.textBoxHeight,
      },
    });
  }

  startLabelEdit(hit: LabelHit): void {
    if (itemIsLocked(hit.item, hit.layer)) {
      toast("This item is locked.", "warning");
      return;
    }
    if (this.text) void this.commitTextEdit();
    const container = document.createElement("div");
    container.className = "canvas-label-editor";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "canvas-label-editor-input";
    input.value = hit.item.label ?? "";
    input.placeholder = "Add label";
    input.setAttribute("aria-label", "Measurement label");
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
    const textarea = edit.textarea;
    let left: number;
    let top: number;
    let width: number;
    let height: number;
    let rotation = edit.rotation;
    let lineHeight: number;
    let fontSize: number;
    if (edit.mode === "cloud" || edit.mode === "callout") {
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
      textarea.style.padding = `${verticalPadding}px ${horizontalPadding}px`;
      textarea.style.whiteSpace = "pre-wrap";
    } else {
      const layout = textItemLayout(
        { text: edit.text, fontSize: edit.fontSize },
        measureTextWidth,
      );
      width = Math.max(52, layout.width * zoom + 4);
      height = Math.max(layout.lineHeight * zoom + 4, layout.height * zoom + 4);
      left = anchor.x - 2;
      top = anchor.y - 2;
      lineHeight = layout.lineHeight * zoom;
      fontSize = Math.max(1, layout.fontSize * zoom);
      textarea.style.padding = "2px";
      textarea.style.whiteSpace = "pre";
    }
    textarea.style.left = `${left}px`;
    textarea.style.top = `${top}px`;
    textarea.style.width = `${width}px`;
    textarea.style.height = `${height}px`;
    textarea.style.fontSize = `${fontSize}px`;
    textarea.style.lineHeight = `${lineHeight}px`;
    textarea.style.fontFamily = FONT_STACK;
    textarea.style.color = edit.color;
    textarea.style.transform = `rotate(${rotation}deg)`;
    textarea.style.transformOrigin = "center";
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
    session: Omit<TextEditSession, "closing" | "container" | "textarea" | "strip" | "resizeHandle">,
  ): void {
    this.cancelLabelEdit();
    const container = document.createElement("div");
    container.className = "canvas-text-editor";
    const textarea = document.createElement("textarea");
    textarea.className = "canvas-text-editor-input";
    textarea.value = session.text;
    textarea.placeholder =
      session.mode === "cloud"
        ? "Cloud text…"
        : session.mode === "callout"
          ? "Callout text…"
          : "Type a note…";
    textarea.wrap = session.mode === "text" ? "off" : "soft";
    textarea.spellcheck = false;
    textarea.setAttribute("aria-label", "Text annotation");
    const strip = document.createElement("div");
    strip.className = "inline-style-strip";

    const sizeField = document.createElement("label");
    sizeField.className = "inline-style-field";
    sizeField.title = "Font size in points";
    const sizeLabel = document.createElement("span");
    sizeLabel.textContent = "Size";
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
    colorField.title = "Text colour";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = session.color;
    colorInput.setAttribute("aria-label", "Text colour");
    colorField.append(colorInput);

    const boldButton = document.createElement("button");
    boldButton.type = "button";
    boldButton.className = "inline-strip-button is-toggle is-bold";
    boldButton.title = "Bold";
    boldButton.setAttribute("aria-label", "Bold");
    boldButton.textContent = "B";
    const underlineButton = document.createElement("button");
    underlineButton.type = "button";
    underlineButton.className = "inline-strip-button is-toggle is-underline";
    underlineButton.title = "Underline";
    underlineButton.setAttribute("aria-label", "Underline");
    underlineButton.textContent = "U";
    const alignGroup = document.createElement("div");
    alignGroup.className = "inline-toggle-group";
    alignGroup.setAttribute("role", "group");
    alignGroup.setAttribute("aria-label", "Text alignment");
    const alignButtons: Array<{ align: TextAlign; button: HTMLButtonElement }> = [];
    for (const align of ["left", "center", "right"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "inline-strip-button is-toggle is-align";
      button.title = `Align ${align}`;
      button.setAttribute("aria-label", `Align text ${align}`);
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
    underlineButton.addEventListener("mousedown", (event) => event.preventDefault());
    boldButton.addEventListener("click", () => {
      edit.bold = !edit.bold;
      refresh();
    });
    underlineButton.addEventListener("click", () => {
      edit.underline = !edit.underline;
      refresh();
    });

    const rotationField = document.createElement("label");
    rotationField.className = "inline-style-field";
    rotationField.title = "Rotation in degrees";
    const rotationLabel = document.createElement("span");
    rotationLabel.textContent = "Angle";
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
    cancelButton.textContent = "Cancel";
    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.className = "inline-strip-button is-primary";
    doneButton.textContent = "Done";
    strip.append(
      sizeField,
      colorField,
      boldButton,
      underlineButton,
      alignGroup,
      rotationField,
      cancelButton,
      doneButton,
    );
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "canvas-text-editor-resize";
    resizeHandle.title = "Drag to resize the text box";
    resizeHandle.setAttribute("aria-hidden", "true");
    const resizable = session.mode === "cloud" || session.mode === "callout";
    if (resizable) container.append(resizeHandle);
    container.append(textarea, strip);

    const edit: TextEditSession = {
      ...session,
      closing: false,
      container,
      textarea,
      strip,
      resizeHandle: resizable ? resizeHandle : null,
    };
    this.text = edit;
    this.editingItem = edit.itemId;
    this.editorLayer.append(container);

    const syncStyle = () => {
      textarea.style.color = edit.color;
      textarea.style.fontWeight = edit.bold ? "700" : "400";
      textarea.style.textDecoration = edit.underline ? "underline" : "none";
      textarea.style.textAlign = edit.align;
      boldButton.setAttribute("aria-pressed", edit.bold ? "true" : "false");
      underlineButton.setAttribute("aria-pressed", edit.underline ? "true" : "false");
      for (const entry of alignButtons) {
        entry.button.setAttribute("aria-pressed", edit.align === entry.align ? "true" : "false");
      }
    };
    const refresh = () => {
      edit.text = textarea.value;
      edit.fontSize = clampTextSize(Number(sizeInput.value));
      edit.color = colorInput.value;
      edit.rotation = normalizeDegrees(Number(rotationInput.value));
      syncStyle();
      this.positionTextEditor();
    };
    sizeInput.addEventListener("input", refresh);
    colorInput.addEventListener("input", refresh);
    rotationInput.addEventListener("input", refresh);
    textarea.addEventListener("input", () => {
      edit.text = textarea.value;
      this.positionTextEditor();
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelTextEdit();
      } else if (event.key === "Enter" && !event.shiftKey) {
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
    const value = edit.text;
    if (edit.itemId) {
      const found = findItem(project, edit.itemId);
      if (!found || itemIsLocked(found.item, found.layer)) {
        this.closeTextEditor();
        return;
      }
      if (edit.mode === "cloud" || edit.mode === "callout") {
        const original = edit.original!;
        const changed =
          value !== original.text ||
          edit.color !== original.color ||
          Math.abs(edit.fontSize - original.fontSize) > 0.001 ||
          edit.bold !== original.bold ||
          edit.underline !== original.underline ||
          edit.align !== original.align ||
          edit.boxWidth !== original.boxWidth ||
          edit.boxHeight !== original.boxHeight;
        this.closeTextEditor();
        if (!changed) return;
        store.mutate(
          (project) => {
            const item = findItem(project, edit.itemId!)?.item;
            if (!item) return;
            item.text = value.trim() || "Revision";
            item.textColor = edit.color;
            item.fontSize = clampTextSize(edit.fontSize);
            if (edit.bold) item.textBold = true;
            else delete item.textBold;
            if (edit.underline) item.textUnderline = true;
            else delete item.textUnderline;
            if (edit.align === "center") delete item.textAlign;
            else item.textAlign = edit.align;
            if (edit.boxWidth) item.textBoxWidth = edit.boxWidth;
            else delete item.textBoxWidth;
            if (edit.boxHeight) item.textBoxHeight = edit.boxHeight;
            else delete item.textBoxHeight;
            item.updatedAt = new Date().toISOString();
          },
          "change",
        );
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
        edit.underline !== original.underline ||
        edit.align !== original.align;
      this.closeTextEditor();
      if (!changed) return;
      store.mutate(
        (project) => {
          const item = findItem(project, edit.itemId!)?.item;
          if (!item) return;
          item.text = value;
          item.color = edit.color;
          item.fontSize = clampTextSize(edit.fontSize);
          if (edit.bold) item.textBold = true;
          else delete item.textBold;
          if (edit.underline) item.textUnderline = true;
          else delete item.textUnderline;
          if (edit.align === "left") delete item.textAlign;
          else item.textAlign = edit.align;
          if (rotation === 0) delete item.rotation;
          else item.rotation = rotation;
          item.updatedAt = new Date().toISOString();
        },
        "change",
      );
      return;
    }

    if (!value.trim()) {
      this.closeTextEditor();
      return;
    }
    const active = project.layers.find(
      (layer) => layer.id === project.activeLayerId && layer.kind === "draw",
    );
    if (active && (!active.visible || active.locked)) {
      toast(
        `“${active.name}” is ${active.locked ? "locked" : "hidden"}. Unlock or show it, or choose another layer.`,
        "warning",
      );
      this.closeTextEditor();
      return;
    }
    const rotation = normalizeDegrees(edit.rotation);
    let layerId = "";
    let itemId = "";
    this.closeTextEditor();
    store.mutate(
      (project) => {
        const layer = ensureActiveLayer(project, "draw");
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
      },
      "change",
    );
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
    store.mutate(
      (project) => {
        const item = findItem(project, edit.itemId)?.item;
        if (!item) return;
        item.label = value || undefined;
        item.updatedAt = new Date().toISOString();
      },
      "change",
    );
  }

  private cancelLabelEdit(): void {
    if (!this.label) return;
    this.label.closing = true;
    this.closeLabelEditor();
  }
}
