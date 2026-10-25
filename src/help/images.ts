/**
 * Help images are bundled by Vite so the offline help dialog can display them.
 * Only files inside docs/screenshots are available; the Markdown renderer never
 * receives a filesystem path.
 */
const modules = import.meta.glob("../../docs/screenshots/*.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(modules)) {
  const name = path.split("/").pop();
  if (name) byName.set(name, url);
}

export const HELP_IMAGE_NAMES = [...byName.keys()].sort();

export function resolveHelpImage(src: string): string | null {
  const name = src.split(/[\\/]/).pop() ?? "";
  return byName.get(name) ?? null;
}
