import { textBoxLayout } from "../../model/annotations";
import { store } from "../../state/store";
import type { EditorState, TextEditSession } from "./shared";
import { positionTextEditor } from "./textPosition";

export function bindTextEditorResize(
  state: EditorState,
  edit: TextEditSession,
  handle: HTMLDivElement,
): void {
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
      positionTextEditor(state);
      state.host.drawContent();
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
