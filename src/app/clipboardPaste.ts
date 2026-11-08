import { hasClipboard } from "../model/clipboard";
import { isSupportedImageFile } from "../io/imageIngest";
import { store } from "../state/store";
import { isEditableTarget } from "../ui/dom";
import { insertImageFile, type ImageFlowHost } from "./imageFlows";
import { pasteSelection } from "./selectionActions";

/** Paste a clipboard image when there is one, otherwise paste copied items. */
export async function pasteFromClipboard(
  host: ImageFlowHost,
  event: ClipboardEvent,
): Promise<void> {
  if (!store.project) return;
  if (document.querySelector(".modal-backdrop")) return;
  if (isEditableTarget(event.target)) return;
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  let image = Array.from(clipboard.files).find(isSupportedImageFile) ?? null;
  if (!image) {
    for (const item of Array.from(clipboard.items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file && isSupportedImageFile(file)) {
        image = file;
        break;
      }
    }
  }
  if (image) {
    event.preventDefault();
    await insertImageFile(host, image);
    return;
  }
  if (hasClipboard(store.project)) {
    event.preventDefault();
    pasteSelection();
  }
}
