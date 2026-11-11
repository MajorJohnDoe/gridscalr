/**
 * Deterministic fuzz generators shared by `tests/fuzz.test.ts` and the
 * adversarial corpus in `tests/robustness/`.
 *
 * The PRNG is a fixed 32-bit mixer with no external dependency, so a failure is
 * reproducible from the seed alone. The path and name generators describe the
 * inputs the file-safety work has to reject: case variants, UNC, verbatim and
 * drive-relative spellings, traversal names, control characters, oversized
 * strings and duplicate entries. They generate inputs only; every assertion
 * lives in the test that owns the invariant.
 */

/** Small deterministic PRNG so fuzz failures are reproducible. */
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

/** Integer in `[0, maxExclusive)`, never negative. */
export function integer(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * Math.max(1, maxExclusive));
}

/** Paths that must stay protected in the corpus. */
export const PROTECTED_SOURCE_PATHS: readonly string[] = [
  "/home/ana/Projects/Level 01/Plan.pdf",
  "/home/ana/Ritningar/Översiktsplan 1.pdf",
  "C:\\Ritningar\\Level 01\\Plan.pdf",
  String.raw`\\server\share\Drawings\Plan.pdf`,
  String.raw`\\?\C:\Ritningar\Plan.pdf`,
];

/**
 * Every spelling of one path that a guard must treat as the same file: the
 * stored spelling, both separator directions, a trailing separator, upper and
 * lower case, the Windows verbatim prefix and the verbatim UNC prefix.
 */
export function pathSpellings(path: string): string[] {
  // Normalise an existing verbatim spelling first, so the generated set
  // describes one file rather than a prefixed variant of a prefixed path.
  const plain = path
    .replace(/^\\\\\?\\UNC\\/i, "\\\\")
    .replace(/^\\\\\?\\/, "")
    .replace(/^\/\/\?\/UNC\//i, "//")
    .replace(/^\/\/\?\//, "");
  const forward = plain.replace(/\\/g, "/");
  const backslashed = forward.replace(/\//g, "\\");
  const spellings = new Set<string>([
    path,
    plain,
    forward,
    backslashed,
    `${forward}/`,
    forward.toUpperCase(),
    forward.toLowerCase(),
  ]);
  // A verbatim spelling only exists for a Windows drive or UNC path. Adding a
  // `\\?\` prefix to a POSIX path would describe a different file.
  if (forward.startsWith("//")) {
    spellings.add(`\\\\?\\UNC\\${backslashed.replace(/^\\+/, "")}`);
    spellings.add(`//?/UNC/${forward.replace(/^\/+/, "")}`);
  } else if (/^[A-Za-z]:\//.test(forward)) {
    spellings.add(`\\\\?\\${backslashed}`);
    spellings.add(`//?/${forward}`);
  }
  return [...spellings].filter(Boolean);
}

/** A neighbouring file that must stay writable. */
export function siblingPath(path: string): string {
  return path.replace(/(\.[A-Za-z0-9]{1,8})?$/, "-markups$1");
}

/** Fragments that make a name unsafe or ambiguous in an archive or path. */
export const UNSAFE_FRAGMENTS: readonly string[] = [
  "..",
  ".",
  "",
  "documents",
  "exports",
  "source-scans",
  "C:",
  "C:/",
  "C:\\",
  "//server/share",
  String.raw`\\server\share`,
  "\\\\?\\C:\\",
  "/",
  "\\",
  "\u0000",
  "\u001f",
  "\u007f",
  "\n",
  "%2e%2e",
  "%2f",
  "CON",
  "nul.txt",
  "Plan.pdf",
  "Plan.PDF",
  "Översiktsplan 1.pdf",
  "✓",
  "a".repeat(260),
];

const JOINERS: readonly string[] = ["/", "\\", "", ".", "-", "%"];

/**
 * A deterministic adversarial name assembled from unsafe fragments, so the
 * corpus reaches traversal, absolute, UNC, control-character and oversized
 * spellings without a hand-written case list.
 */
export function adversarialName(rng: () => number, parts = 3): string {
  const count = 1 + integer(rng, parts);
  const fragments: string[] = [];
  for (let index = 0; index < count; index += 1) {
    fragments.push(pick(rng, UNSAFE_FRAGMENTS));
  }
  return fragments.join(pick(rng, JOINERS));
}

/** Case variants of one name, used for duplicate-entry detection. */
export function caseVariants(name: string): string[] {
  return [...new Set([name, name.toLowerCase(), name.toUpperCase()])];
}

/** Deterministic truncation points for a parsed-input corpus. */
export function truncationOffsets(length: number): number[] {
  return [...new Set([0, 1, 2, 3, Math.floor(length / 2), length - 3, length - 2, length - 1])]
    .filter((offset) => offset >= 0 && offset < length)
    .sort((a, b) => a - b);
}

/** A readable, deterministic display name for a seeded iteration. */
export function corpusLabel(seed: number, index: number): string {
  return `seed 0x${seed.toString(16)} case ${index}`;
}
