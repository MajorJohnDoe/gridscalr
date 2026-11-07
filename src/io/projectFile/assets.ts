import type { ImageAsset } from "../../model/types";

export function normalizeAssets(value: unknown): Record<string, ImageAsset> {
  const assets: Record<string, ImageAsset> = {};
  if (typeof value !== "object" || value === null) return assets;
  for (const [id, entry] of Object.entries(value)) {
    if (!id || id === "__proto__" || id === "constructor" || id === "prototype") continue;
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Partial<ImageAsset>;
    const mime: ImageAsset["mime"] | null =
      raw.mime === "image/png" || raw.mime === "image/jpeg" ? raw.mime : null;
    if (!mime) continue;
    if (typeof raw.data !== "string") continue;
    const prefix = mime === "image/png" ? "data:image/png;base64," : "data:image/jpeg;base64,";
    if (!raw.data.startsWith(prefix) || raw.data.length <= prefix.length) continue;
    if (
      typeof raw.width !== "number" ||
      !Number.isFinite(raw.width) ||
      raw.width <= 0 ||
      typeof raw.height !== "number" ||
      !Number.isFinite(raw.height) ||
      raw.height <= 0
    ) {
      continue;
    }
    assets[id] = {
      id,
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim().slice(0, 260)
          : `Image.${mime === "image/png" ? "png" : "jpg"}`,
      mime,
      width: Math.round(raw.width),
      height: Math.round(raw.height),
      byteSize:
        typeof raw.byteSize === "number" && Number.isFinite(raw.byteSize)
          ? Math.max(0, Math.round(raw.byteSize))
          : 0,
      data: raw.data,
    };
  }
  return assets;
}
