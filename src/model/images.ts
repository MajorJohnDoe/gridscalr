import { makeId } from "./calibration";
import type {
  ImageAsset,
  ImageMode,
  MarkupItem,
  PageSize,
  Point,
  Project,
} from "./types";

/** Hard limits for one embedded image. */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 4000;
/** Natural image size is interpreted at 96 DPI: 1 px = 0.75 PDF points. */
export const IMAGE_POINTS_PER_PIXEL = 72 / 96;

export const IMAGE_MODE_LABELS: Record<ImageMode, string> = {
  background: "Background",
  annotation: "Annotation",
};

export function imageAssetForItem(
  project: Project,
  item: MarkupItem,
): ImageAsset | undefined {
  if (item.kind !== "image" || !item.image) return undefined;
  return project.assets[item.image.assetId];
}

export function imageModeOf(item: MarkupItem): ImageMode {
  return item.image?.mode === "annotation" ? "annotation" : "background";
}

export function imageOpacity(item: MarkupItem): number {
  if (typeof item.opacity !== "number" || !Number.isFinite(item.opacity)) return 1;
  return Math.max(0, Math.min(1, item.opacity));
}

export function naturalImageSize(asset: ImageAsset): PageSize {
  return {
    width: asset.width * IMAGE_POINTS_PER_PIXEL,
    height: asset.height * IMAGE_POINTS_PER_PIXEL,
  };
}

/**
 * Larger images scale proportionally to fit inside the page. Wide images are
 * therefore limited by the page width. Images that already fit keep their
 * natural 96 DPI size.
 */
export function initialImageSize(asset: ImageAsset, pageSize: PageSize): PageSize {
  const natural = naturalImageSize(asset);
  if (natural.width > pageSize.width || natural.height > pageSize.height) {
    const scale = Math.min(
      pageSize.width / Math.max(1e-6, natural.width),
      pageSize.height / Math.max(1e-6, natural.height),
    );
    return { width: natural.width * scale, height: natural.height * scale };
  }
  return natural;
}

export function createImageItem(
  asset: ImageAsset,
  page: number,
  pageSize: PageSize,
  mode: ImageMode = "background",
  center?: Point,
): MarkupItem {
  const size = initialImageSize(asset, pageSize);
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const sought = center ?? { x: pageSize.width / 2, y: pageSize.height / 2 };
  const clampCenter = (value: number, half: number, extent: number): number => {
    const min = half;
    const max = extent - half;
    return max < min ? extent / 2 : Math.min(max, Math.max(min, value));
  };
  const centerX = clampCenter(sought.x, halfWidth, pageSize.width);
  const centerY = clampCenter(sought.y, halfHeight, pageSize.height);
  const now = new Date().toISOString();
  return {
    id: makeId("item"),
    page,
    kind: "image",
    points: [
      { x: centerX - halfWidth, y: centerY - halfHeight },
      { x: centerX + halfWidth, y: centerY + halfHeight },
    ],
    color: "#7aa2f7",
    strokeWidth: 1,
    opacity: 1,
    image: { assetId: asset.id, mode },
    label: asset.name,
    visible: true,
    locked: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createImageAsset(input: {
  name: string;
  mime: ImageAsset["mime"];
  width: number;
  height: number;
  byteSize: number;
  data: string;
}): ImageAsset {
  return {
    id: makeId("img"),
    name: input.name,
    mime: input.mime,
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
    byteSize: Math.max(0, Math.round(input.byteSize)),
    data: input.data,
  };
}

export function formatImageDimensions(asset: ImageAsset): string {
  return `${asset.width} × ${asset.height} px`;
}
