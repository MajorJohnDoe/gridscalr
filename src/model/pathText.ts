/**
 * Absolute Windows and POSIX paths are replaced so copied support text never
 * discloses a customer folder or drawing name.
 *
 * URLs are left alone: the character in front of their first "/" is ":" rather
 * than whitespace, a quote or an opening bracket. IPC error details use
 * `<path>: <OS message>`, so a second pair of patterns captures a path that
 * contains spaces up to that delimiter; a plain prose path still stops at the
 * first space, which keeps diagnostics from eating the words around it.
 */
const PATH_PATTERNS: readonly RegExp[] = [
  /\b[A-Za-z]:\\[^\n"'<>|:]+(?=:\s)/g,
  /(?:^|[\s"'(=])\/(?:[^"'()=:\n]*\/)[^"'()=:\n]*(?=:\s)/g,
  /\b[A-Za-z]:\\[^\s"'<>|]+/g,
  /(?:^|[\s"'(=])\/(?:[^\s"'()=]+\/)+[^\s"'()=]*/g,
];

export const PATH_PLACEHOLDER = "<path>";

/** Replaces every absolute path in `value` with a stable placeholder. */
export function sanitizePaths(value: string, replacement = PATH_PLACEHOLDER): string {
  let text = value;
  for (const pattern of PATH_PATTERNS) text = text.replace(pattern, replacement);
  return text;
}

/** True when the text contains something the sanitizer would replace. */
export function containsAbsolutePath(value: string): boolean {
  return sanitizePaths(value) !== value;
}
