import type { TextRun } from "../model/types";
import {
  applyRunStyle,
  resolveTextRun,
  type RichTextDefaults,
  type RunStylePatch,
} from "../model/richText";
import { TEXT_FONT_STACK, TEXT_LINE_HEIGHT } from "../model/text";

interface ResolvedSelectionStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: number;
  color: string;
}

/**
 * A small contenteditable wrapper for rich text boxes. Each run is a span with
 * data attributes, so the editor can show bold, italic, underline, size and
 * colour while typing without storing HTML in the project.
 */
export class RichEditorController {
  readonly element: HTMLDivElement;
  private defaults: RichTextDefaults;
  private zoom: number;
  private savedRange: Range | null = null;
  private readonly onChange: () => void;

  constructor(
    runs: readonly TextRun[],
    defaults: RichTextDefaults,
    zoom: number,
    onChange: () => void,
  ) {
    this.defaults = defaults;
    this.zoom = zoom;
    this.onChange = onChange;
    this.element = document.createElement("div");
    this.element.className = "canvas-text-editor-input canvas-text-editor-rich";
    this.element.contentEditable = "true";
    this.element.spellcheck = false;
    this.element.setAttribute("role", "textbox");
    this.element.setAttribute("aria-multiline", "true");
    this.render(runs);
    this.bind();
  }

  setMetrics(defaults: RichTextDefaults, zoom: number): void {
    this.defaults = defaults;
    this.zoom = zoom;
    this.applyBaseStyle();
    this.refreshSpanStyles();
  }

  getText(): string {
    return this.getRuns()
      .map((run) => run.text)
      .join("");
  }

  hasSelection(): boolean {
    return Boolean(this.activeRange());
  }

  selectionStyle(): ResolvedSelectionStyle | null {
    const range = this.activeRange();
    if (!range) return null;
    const nodes = this.selectedTextNodes(range);
    if (!nodes.length) return null;
    const styles = nodes.map((node) => this.styleAtNode(node));
    return {
      bold: styles.every((style) => style.bold),
      italic: styles.every((style) => style.italic),
      underline: styles.every((style) => style.underline),
      size: styles[0].size,
      color: styles[0].color,
    };
  }

  toggle(key: "bold" | "italic" | "underline"): boolean {
    const current = this.selectionStyle();
    if (!current) return false;
    return this.applyStyle({ [key]: !current[key] });
  }

  applyStyle(patch: RunStylePatch): boolean {
    const range = this.activeRange();
    if (!range) return false;
    const offsets = this.selectionOffsets(range);
    if (!offsets || offsets.start === offsets.end) return false;
    const next = applyRunStyle(this.getRuns(), offsets.start, offsets.end, patch);
    this.savedRange = null;
    this.render(next);
    this.element.focus({ preventScroll: true });
    this.setSelectionByOffsets(
      offsets.start,
      Math.min(offsets.end, next.map((run) => run.text).join("").length),
    );
    this.onChange();
    return true;
  }

  insertLineBreak(): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const br = document.createElement("br");
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    this.onChange();
  }

  focusEnd(): void {
    this.element.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(this.element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private bind(): void {
    const capture = () => this.captureRange();
    for (const eventName of ["mouseup", "keyup", "blur", "focus"] as const) {
      this.element.addEventListener(eventName, capture);
    }
    this.element.addEventListener("input", () => this.onChange());
    this.element.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      this.insertPlainText(text);
      this.onChange();
    });
    this.element.addEventListener("drop", (event) => event.preventDefault());
  }

  private captureRange(): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!range.collapsed && this.element.contains(range.commonAncestorContainer)) {
      this.savedRange = range.cloneRange();
    }
  }

  private activeRange(): Range | null {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed && this.element.contains(range.commonAncestorContainer)) {
        this.savedRange = range.cloneRange();
        return range;
      }
    }
    if (this.savedRange && this.element.contains(this.savedRange.commonAncestorContainer)) {
      return this.savedRange;
    }
    return null;
  }

  private insertPlainText(text: string): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .forEach((line, index) => {
        if (index > 0) fragment.appendChild(document.createElement("br"));
        if (line) fragment.appendChild(document.createTextNode(line));
      });
    range.insertNode(fragment);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private render(runs: readonly TextRun[]): void {
    this.element.replaceChildren();
    this.element.style.whiteSpace = "pre-wrap";
    this.applyBaseStyle();
    const text = runs.map((run) => run.text).join("");
    if (!text) {
      this.element.appendChild(document.createElement("br"));
      return;
    }
    for (const source of runs) {
      const run = resolveTextRun(source, this.defaults);
      const paragraphs = run.text.replace(/\r\n?/g, "\n").split("\n");
      paragraphs.forEach((paragraph, index) => {
        if (index > 0) this.element.appendChild(document.createElement("br"));
        if (!paragraph) return;
        const span = document.createElement("span");
        span.textContent = paragraph;
        this.styleSpan(span, run);
        this.element.appendChild(span);
      });
    }
  }

  private applyBaseStyle(): void {
    const { defaults, zoom } = this;
    this.element.style.fontFamily = TEXT_FONT_STACK;
    this.element.style.fontSize = `${Math.max(1, defaults.fontSize * zoom)}px`;
    this.element.style.lineHeight = `${Math.max(1, defaults.fontSize * TEXT_LINE_HEIGHT * zoom)}px`;
    this.element.style.fontWeight = defaults.bold ? "700" : "400";
    this.element.style.fontStyle = defaults.italic ? "italic" : "normal";
    this.element.style.textDecoration = defaults.underline ? "underline" : "none";
    this.element.style.color = defaults.color;
    this.element.style.caretColor = defaults.color;
  }

  private styleSpan(span: HTMLSpanElement, style: ResolvedSelectionStyle): void {
    span.style.fontWeight = style.bold ? "700" : "400";
    span.style.fontStyle = style.italic ? "italic" : "normal";
    span.style.textDecoration = style.underline ? "underline" : "none";
    span.style.fontSize = `${Math.max(1, style.size * this.zoom)}px`;
    span.style.color = style.color;
    span.dataset.bold = String(style.bold);
    span.dataset.italic = String(style.italic);
    span.dataset.underline = String(style.underline);
    span.dataset.size = String(style.size);
    span.dataset.color = style.color;
  }

  private refreshSpanStyles(): void {
    for (const span of this.element.querySelectorAll<HTMLSpanElement>("span")) {
      const text = span.textContent ?? "";
      if (!text) continue;
      const style = this.styleAtNode(span);
      this.styleSpan(span, style);
    }
  }

  private styleAtNode(node: Node): ResolvedSelectionStyle {
    const style: ResolvedSelectionStyle = {
      bold: this.defaults.bold,
      italic: this.defaults.italic,
      underline: this.defaults.underline,
      size: this.defaults.fontSize,
      color: this.defaults.color,
    };
    let element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : (node.parentElement as Element | null);
    let foundBold = false;
    let foundItalic = false;
    let foundUnderline = false;
    let foundSize = false;
    let foundColor = false;
    while (element && element !== this.element) {
      const data = (element as HTMLElement).dataset;
      if (!foundBold && data.bold !== undefined) {
        style.bold = data.bold === "true";
        foundBold = true;
      }
      if (!foundItalic && data.italic !== undefined) {
        style.italic = data.italic === "true";
        foundItalic = true;
      }
      if (!foundUnderline && data.underline !== undefined) {
        style.underline = data.underline === "true";
        foundUnderline = true;
      }
      if (!foundSize && data.size !== undefined) {
        const value = Number(data.size);
        if (Number.isFinite(value)) style.size = value;
        foundSize = true;
      }
      if (!foundColor && data.color) {
        style.color = data.color;
        foundColor = true;
      }
      element = element.parentElement;
    }
    return style;
  }

  private selectionOffsets(range: Range): { start: number; end: number } | null {
    let start: number | null = null;
    let end: number | null = null;
    let total = 0;
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (node === range.startContainer) start = total + range.startOffset;
        if (node === range.endContainer) end = total + range.endOffset;
        total += length;
        return;
      }
      if (node instanceof HTMLBRElement) {
        if (node === range.startContainer) start = total;
        if (node === range.endContainer) end = total;
        total += 1;
        return;
      }
      node.childNodes.forEach(walk);
    };
    this.element.childNodes.forEach(walk);
    if (range.startContainer === this.element) start = 0;
    if (range.endContainer === this.element) end = total;
    if (start === null || end === null) return null;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }

  private setSelectionByOffsets(start: number, end: number): void {
    const selection = window.getSelection();
    if (!selection) return;
    let total = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (!startNode && start <= total + length) {
          startNode = node;
          startOffset = Math.max(0, Math.min(length, start - total));
        }
        if (!endNode && end <= total + length) {
          endNode = node;
          endOffset = Math.max(0, Math.min(length, end - total));
        }
        total += length;
        return;
      }
      if (node instanceof HTMLBRElement) {
        total += 1;
        return;
      }
      node.childNodes.forEach(walk);
    };
    this.element.childNodes.forEach(walk);
    if (!startNode || !endNode) {
      this.focusEnd();
      return;
    }
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    selection.removeAllRanges();
    selection.addRange(range);
    this.savedRange = range.cloneRange();
  }

  private selectedTextNodes(range: Range): Text[] {
    if (!this.element.contains(range.commonAncestorContainer)) return [];
    const walker = document.createTreeWalker(this.element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? "";
      if (text && range.intersectsNode(node)) nodes.push(node as Text);
      node = walker.nextNode();
    }
    return nodes;
  }

  getRuns(): TextRun[] {
    const runs: TextRun[] = [];
    const push = (text: string, style: ResolvedSelectionStyle) => {
      if (!text) return;
      const run: TextRun = {
        text,
        bold: style.bold !== this.defaults.bold ? style.bold : undefined,
        italic: style.italic !== this.defaults.italic ? style.italic : undefined,
        underline: style.underline !== this.defaults.underline ? style.underline : undefined,
        size: style.size !== this.defaults.fontSize ? style.size : undefined,
        color: style.color !== this.defaults.color ? style.color : undefined,
      };
      const last = runs[runs.length - 1];
      if (
        last &&
        last.bold === run.bold &&
        last.italic === run.italic &&
        last.underline === run.underline &&
        last.size === run.size &&
        last.color === run.color
      ) {
        last.text += text;
      } else {
        runs.push(run);
      }
    };
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        push(node.textContent ?? "", this.styleAtNode(node));
        return;
      }
      if (node instanceof HTMLBRElement) {
        push("\n", this.styleAtNode(node));
        return;
      }
      node.childNodes.forEach(walk);
    };
    this.element.childNodes.forEach(walk);
    const text = runs.map((run) => run.text).join("");
    if (text === "\n" && this.element.childNodes.length === 1) return [{ text: "" }];
    return runs.length ? runs : [{ text: "" }];
  }
}
