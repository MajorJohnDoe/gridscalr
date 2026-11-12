import type { PDFDocument, PDFImage } from "pdf-lib";
import type { ImageAsset, Project } from "../../model/types";
import { itemIsVisible } from "../../model/layers";
import { buildLayerHierarchy } from "../../model/layerHierarchy";
import { pageIdAt } from "../../model/pages";
import type { ExportImages } from "./types";

export async function embedImages(
  pdf: PDFDocument,
  project: Project,
  pages: readonly number[],
  selectedLayers: ReadonlySet<string>,
): Promise<ExportImages> {
  const selectedPages = new Set(
    pages
      .map((page) => pageIdAt(project, page))
      .filter((pageId): pageId is string => Boolean(pageId)),
  );
  const embedded: ExportImages = new Map<string, PDFImage>();
  const assets = new Map<string, ImageAsset>();
  const hierarchy = buildLayerHierarchy(project.layers);
  for (const layer of project.layers) {
    if (!selectedLayers.has(layer.id)) continue;
    for (const item of layer.items) {
      if (item.kind !== "image" || !item.image || !itemIsVisible(item, layer, hierarchy)) continue;
      if (!selectedPages.has(item.pageId)) continue;
      const asset = project.assets[item.image.assetId];
      if (asset) assets.set(asset.id, asset);
    }
  }
  for (const asset of assets.values()) {
    if (!asset.data) continue;
    try {
      embedded.set(
        asset.id,
        asset.mime === "image/png"
          ? await pdf.embedPng(asset.data)
          : await pdf.embedJpg(asset.data),
      );
    } catch {
      // A corrupt image must not abort the rest of the drawing export.
    }
  }
  return embedded;
}
