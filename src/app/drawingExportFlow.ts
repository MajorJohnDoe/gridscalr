import type { CanvasView } from "../canvas/CanvasView";
import { defaultDrawingExportOptions, type DrawingExportOptions } from "../model/export";
import { layerVisibleOnPage } from "../model/layers";
import { pageIdAt } from "../model/pages";
import type { Project } from "../model/types";
import { store } from "../state/store";
import { drawingExportDialog } from "../ui/dialogs";

/** The export dialog loop, including the interactive crop step. */
export async function chooseDrawingExport(
  canvas: CanvasView,
  project: Project,
): Promise<DrawingExportOptions | null> {
  let options = defaultDrawingExportOptions(project, store.ui.page);
  let initialAreaMode: "whole" | "crop" | undefined;
  let cropReferencePage = store.ui.page;
  for (;;) {
    const pageCount = project.pages.length;
    const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
    const result = await drawingExportDialog({
      currentPage: store.ui.page,
      pageCount,
      layers: project.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: pageNumbers.some((page) => {
          const pageId = pageIdAt(project, page);
          return pageId ? layerVisibleOnPage(layer, pageId) : false;
        }),
        color: layer.color,
      })),
      initial: options,
      initialAreaMode,
      cropReferencePage,
    });
    if (!result) return null;
    options = result.options;
    if (result.action === "export") return options;

    initialAreaMode = "crop";
    const crop = await canvas.pickExportCrop(options.crop);
    if (crop) {
      options = { ...options, crop };
      cropReferencePage = store.ui.page;
    }
  }
}
