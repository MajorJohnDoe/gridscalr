import { perfSpan } from "../features/perfMonitor";
import type { ImageAsset, Project } from "../model/types";

interface DetachedPayload {
  asset: ImageAsset;
  data: string;
}

/**
 * Serialises a project for the undo history without its embedded image
 * payloads.
 *
 * The history re-attaches payloads from a runtime map on restore, so the text
 * must never carry them. Filtering them with a `JSON.stringify` replacer
 * disables V8's fast path and costs about four times a plain stringify (F-145),
 * so the payloads are cleared for the duration of one plain stringify and
 * restored immediately afterwards. Assigning `undefined` (rather than
 * `delete`) keeps the asset objects in the same shape; JSON omits the key
 * either way.
 *
 * The output is byte-identical to the previous replacer form: `data` disappears
 * from each asset exactly as `return undefined` did, and no other project field
 * holds a payload string. `tests/storeSnapshot.test.ts` pins that equality
 * against fixtures with embedded PNG and JPEG payloads.
 */
export function serializeProject(project: Project): string {
  const detached: DetachedPayload[] = [];
  for (const asset of Object.values(project.assets ?? {})) {
    if (!asset.data) continue;
    detached.push({ asset, data: asset.data });
  }
  for (const { asset } of detached) (asset as { data?: string }).data = undefined;
  try {
    return perfSpan(
      "serialize",
      () => JSON.stringify(project),
      (text) => text.length,
    );
  } finally {
    for (const { asset, data } of detached) asset.data = data;
  }
}
