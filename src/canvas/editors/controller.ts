import type { Layer, MarkupItem, Point } from "../../model/types";
import { cancelLabelEdit, commitLabelEdit, positionLabelEditor, startLabelEdit } from "./labels";
import type { EditorHost, EditorState, LabelHit } from "./shared";
import { cancelTextEdit } from "./shared";
import {
  startCalloutTextEdit,
  startCloudTextEdit,
  startNewText,
  startTextEdit,
  startTextBoxEdit,
} from "./text";
import { commitTextEdit } from "./textCommit";
import { positionTextEditor } from "./textPosition";

/**
 * Owns the inline text and measurement-label editors. The canvas remains
 * responsible for page coordinates and rendering; this controller owns only
 * DOM editing state and persistence.
 */
export class CanvasEditorController {
  private readonly state: EditorState;

  constructor(host: EditorHost) {
    const editorLayer = document.createElement("div");
    editorLayer.className = "canvas-editor-layer";
    host.host.append(editorLayer);
    this.state = {
      host,
      editorLayer,
      text: null,
      label: null,
      editingItem: null,
      editingLabel: null,
    };
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
  }

  get hasEditors(): boolean {
    return this.state.text !== null || this.state.label !== null;
  }

  get editingItemId(): string | null {
    return this.state.editingItem;
  }

  get editingLabelId(): string | null {
    return this.state.editingLabel;
  }

  get textSession() {
    return this.state.text;
  }

  handleStoreChange(reason: string): void {
    if (!this.state.text && !this.state.label) return;
    if (reason === "view") {
      positionTextEditor(this.state);
      positionLabelEditor(this.state);
      return;
    }
    if (reason !== "selection" && reason !== "change" && reason !== "save") {
      cancelTextEdit(this.state);
      cancelLabelEdit(this.state);
    }
  }

  startNewText(point: Point): void {
    startNewText(this.state, point);
  }

  startTextEdit(item: MarkupItem, layer: Layer): void {
    startTextEdit(this.state, item, layer);
  }

  startTextBoxEdit(item: MarkupItem, layer: Layer): void {
    startTextBoxEdit(this.state, item, layer);
  }

  startCloudTextEdit(item: MarkupItem, layer: Layer): void {
    startCloudTextEdit(this.state, item, layer);
  }

  startCalloutTextEdit(item: MarkupItem, layer: Layer): void {
    startCalloutTextEdit(this.state, item, layer);
  }

  startLabelEdit(hit: LabelHit): void {
    startLabelEdit(this.state, hit);
  }

  positionTextEditor(): void {
    positionTextEditor(this.state);
  }

  positionLabelEditor(): void {
    positionLabelEditor(this.state);
  }

  commitActiveEditors(): void {
    if (this.state.text && !this.state.text.closing) void commitTextEdit(this.state);
    if (this.state.label && !this.state.label.closing) void commitLabelEdit(this.state);
  }

  destroy(): void {
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.state.text?.container.remove();
    this.state.label?.container.remove();
    this.state.text = null;
    this.state.label = null;
    this.state.editingItem = null;
    this.state.editingLabel = null;
    this.state.editorLayer.remove();
  }

  private onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.state.text && !this.state.label) return;
    const target = event.target;
    if (target instanceof Node && this.state.editorLayer.contains(target)) return;
    this.commitActiveEditors();
  };
}
