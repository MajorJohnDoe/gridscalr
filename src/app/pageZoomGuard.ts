/**
 * WebView2 zooms the whole window on Ctrl + wheel and touchpad pinch once pinch
 * support is enabled. Swallow the default zoom action so only the canvas reacts
 * to the gesture.
 */
export function installPageZoomGuard(target: Window = window): () => void {
  const onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };
  target.addEventListener("wheel", onWheel, { passive: false, capture: true });
  return () => target.removeEventListener("wheel", onWheel, { capture: true });
}
