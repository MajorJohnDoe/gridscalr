/**
 * Documented input limits (F-032, F-033).
 *
 * The Rust commands enforce the same values; the browser fallback checks the
 * picked `File.size` before reading. Keep this file and `docs/limitations.md`
 * in step. Limits are deliberately explicit: an oversized file fails with a
 * structured `fileTooLarge` error instead of being buffered without bound.
 */
export const MAX_PROJECT_BYTES = 256 * 1024 * 1024;

/** One opened source PDF/TIF, which is decoded by PDF.js or Tesseract. */
export const MAX_SOURCE_BYTES = 1024 * 1024 * 1024;

/** Uncompressed total of one `.gridscalr.zip` extraction (Rust `package.rs`). */
export const MAX_PACKAGE_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
