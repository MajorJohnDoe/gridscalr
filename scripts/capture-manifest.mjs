/**
 * Pure serialization for `docs/screenshots/manifest.json`.
 *
 * The committed manifest stores every non-ASCII character as a `\uXXXX` escape,
 * while `JSON.stringify` emits literal characters. Writing the generator output
 * directly therefore rewrote unrelated title lines on every capture. This
 * formatter keeps the repository's escape style so a capture diff only contains
 * what actually changed.
 */

/** Two-space indentation, a trailing newline, and `\uXXXX` for every non-ASCII code unit. */
export function serializeManifest(manifest) {
  const json = JSON.stringify(manifest, null, 2);
  return `${json.replace(
    /[^\x00-\x7F]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  )}\n`;
}
