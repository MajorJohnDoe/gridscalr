//! Documented package limits shared by creation, inspection and extraction.
//!
//! The frontend mirrors the uncompressed total in `src/io/limits.ts`; lowering a
//! limit here without the mirror would let the UI offer a package the shell then
//! refuses.

/// The package format marker stored in `manifest.json`.
pub const PACKAGE_FORMAT: &str = "gridscalr-package";
/// The manifest format version this build reads and writes.
pub const PACKAGE_FORMAT_VERSION: u32 = 1;
pub const MAX_ENTRIES: usize = 4096;
/// A single drawing inside a package. Deliberately generous for a scanned plan
/// while staying far below a memory-exhausting size.
pub const MAX_ENTRY_BYTES: u64 = 1024 * 1024 * 1024;
/// The documented uncompressed total for one extraction. The previous 16 GiB
/// limit could fill a laptop disk before any checksum ran (F-033).
pub const MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// The compressed `.gridscalr.zip` file itself.
pub const MAX_PACKAGE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const MAX_MANIFEST_BYTES: u64 = 2 * 1024 * 1024;
/// Ratio above which one entry is treated as a decompression bomb.
pub(crate) const MAX_COMPRESSION_RATIO: u64 = 200;
/// Read/write buffer for streamed entries.
pub(crate) const CHUNK_BYTES: usize = 64 * 1024;
