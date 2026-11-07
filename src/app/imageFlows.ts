import { addItem } from "../model/layers";
import { createImageItem } from "../model/images";
import type { ImageAsset, Layer, PageSize } from "../model/types";
import { ingestImageBlob, isSupportedImageFile } from "../io/imageIngest";
import { pickImage } from "../io/platform";
import { describeError } from "../io/platformError";
import { store } from "../state/store";
import { layerLockedOnPage, layerVisibleOnPage } from "../model/layers";
import { toast } from "../ui/toast";
import { t } from "../i18n";

export interface ImageFlowHost {
  enqueuePageSize(page: number): Promise<PageSize | undefined>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : describeError(error);
}

export async function insertImageFlow(host: ImageFlowHost): Promise<void> {
  if (!store.project) return;
  let file: File | null;
  try {
    file = await pickImage();
  } catch (error) {
    toast(errorMessage(error), "error");
    return;
  }
  if (!file) return;
  await insertImageFile(host, file);
}

export async function insertImageFile(host: ImageFlowHost, file: File): Promise<void> {
  const project = store.project;
  if (!project) return;
  if (!isSupportedImageFile(file)) {
    toast(t("app.chooseImage"), "warning");
    return;
  }
  let asset: ImageAsset;
  try {
    asset = await ingestImageBlob(file, file.name);
  } catch (error) {
    toast(errorMessage(error), "error");
    return;
  }
  const page = store.ui.page;
  const pageSize = await host.enqueuePageSize(page);
  if (!pageSize) {
    toast(t("app.waitForRender"), "warning");
    return;
  }
  if (store.project !== project) return;
  const layer = imageTargetLayer();
  if (!layer) {
    toast(t("app.showDrawingLayer"), "warning");
    return;
  }
  const item = createImageItem(asset, page, pageSize, "background");
  store.registerImageAsset(asset);
  store.mutate((project) => {
    project.assets[asset.id] = asset;
    addItem(project, layer.id, item);
  }, "change");
  store.setSelection({ layerId: layer.id, itemId: item.id });
  toast(t("app.imageAdded", { layer: layer.name }), "success");
}

function imageTargetLayer(): Layer | null {
  const project = store.project;
  if (!project) return null;
  const page = store.ui.page;
  const active = project.layers.find((layer) => layer.id === project.activeLayerId);
  if (
    active &&
    active.kind === "draw" &&
    layerVisibleOnPage(active, page) &&
    !layerLockedOnPage(active, page)
  ) {
    return active;
  }
  const candidate = project.layers.find(
    (layer) =>
      layer.kind === "draw" && layerVisibleOnPage(layer, page) && !layerLockedOnPage(layer, page),
  );
  if (candidate) {
    store.setActiveLayer(candidate.id);
    return candidate;
  }
  return null;
}
