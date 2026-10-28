import { IMAGE_MAX_BYTES, IMAGE_MAX_DIMENSION, createImageAsset } from "../model/images";
import type { ImageAsset } from "../model/types";

export interface PickedImage {
  name: string;
  bytes: Uint8Array;
}

export type SupportedImageMime = "image/png" | "image/jpeg";

export function supportedImageMime(type: string): SupportedImageMime | null {
  if (type === "image/png" || type === "image/jpeg" || type === "image/jpg") {
    return type === "image/jpg" ? "image/jpeg" : type;
  }
  return null;
}

export function isSupportedImageFile(file: File): boolean {
  if (supportedImageMime(file.type)) return true;
  return /\.(png|jpe?g)$/i.test(file.name);
}

function sniffImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: SupportedImageMime,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
      mime,
      quality,
    );
  });
}

/** Re-encodes a decoded bitmap, shrinking it to the dimension limit. */
async function encodeBitmap(
  source: CanvasImageSource,
  width: number,
  height: number,
  mime: SupportedImageMime,
  quality?: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This environment cannot process images.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, mime, quality);
}

/**
 * Reads a PNG or JPEG, downscales it to the milestone 4 limits and returns an
 * embedded asset. The source file is never referenced after this call.
 */
export async function ingestImageBlob(blob: Blob, name: string): Promise<ImageAsset> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const byExtension: SupportedImageMime | null =
    extension === "png"
      ? "image/png"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : null;
  const mime = sniffImageMime(bytes) ?? supportedImageMime(blob.type) ?? byExtension;
  if (!mime) {
    throw new Error("Choose a PNG or JPEG image.");
  }

  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release = () => {};
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    release = () => bitmap.close();
  } else {
    const url = URL.createObjectURL(blob);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not decode the image."));
      element.src = url;
    });
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
    release = () => URL.revokeObjectURL(url);
  }

  try {
    if (!width || !height) throw new Error("The image has no pixels.");
    const longest = Math.max(width, height);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / longest);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    let result: Blob | null = null;

    if (scale === 1 && bytes.length <= IMAGE_MAX_BYTES) {
      result = new Blob([bytes], { type: mime });
    } else {
      result = await encodeBitmap(
        source,
        targetWidth,
        targetHeight,
        mime,
        mime === "image/jpeg" ? 0.85 : undefined,
      );
      if (result.size > IMAGE_MAX_BYTES && mime === "image/jpeg") {
        for (const quality of [0.7, 0.55, 0.4]) {
          const next = await encodeBitmap(source, targetWidth, targetHeight, mime, quality);
          if (next.size <= IMAGE_MAX_BYTES) {
            result = next;
            break;
          }
        }
      }
    }

    if (!result || result.size > IMAGE_MAX_BYTES) {
      throw new Error(
        `The image is still larger than ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB after resizing.`,
      );
    }

    const data = await readBlobAsDataUrl(result);
    const actualMime = supportedImageMime(result.type) ?? mime;
    return createImageAsset({
      name: name.trim() || `Image.${actualMime === "image/png" ? "png" : "jpg"}`,
      mime: actualMime,
      width: targetWidth,
      height: targetHeight,
      byteSize: result.size,
      data,
    });
  } finally {
    release();
  }
}
