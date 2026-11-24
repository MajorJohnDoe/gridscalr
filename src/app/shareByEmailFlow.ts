import type { CanvasView } from "../canvas/CanvasView";
import { sendByEmailFlow } from "../features/shareByEmail";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { chooseDrawingExport } from "./drawingExportFlow";

/** App wiring for File -> Send & share -> Send by e-mail. */
export function sendDrawingByEmail(canvas: CanvasView, renderer: PdfRenderer | null): void {
  void sendByEmailFlow({
    renderer,
    chooseDrawingExport: (project) => chooseDrawingExport(canvas, project),
  });
}
