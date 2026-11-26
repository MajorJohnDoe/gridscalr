//! Portable `.gridscalr.zip` packages: create, inspect and extract.
//!
//! A package carries the project JSON, its drawings, optional exports, original
//! TIF scans and derived PDF caches behind one manifest of sizes and SHA-256
//! checksums. The modules divide one concern each:
//!
//! - `limits` — the documented byte, entry and ratio caps;
//! - `names` — archive-name validation and safe folder names;
//! - `manifest` — manifest shape, checksums and the README;
//! - `request` and `project` — pre-write request and project validation;
//! - `create`, `write` — streamed writing and atomic replacement;
//! - `inspect` — bounded archive scan and the destination preview;
//! - `extract`, `temp` — staged extraction, checksum verification and the move
//!   into place;
//! - `jobs`, `progress`, `error` — cancellation, progress and the error surface.
//!
//! The Tauri command names stay `package_create`, `package_inspect`,
//! `package_extract` and `package_cancel`; `lib.rs` registers them through this
//! module.

mod create;
mod error;
mod extract;
mod hash;
mod inspect;
mod jobs;
mod limits;
mod manifest;
mod names;
mod progress;
mod project;
mod request;
mod temp;
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;
mod types;
mod write;

pub use create::{__cmd__package_create, __tauri_command_name_package_create, package_create};
pub use extract::{__cmd__package_extract, __tauri_command_name_package_extract, package_extract};
pub use inspect::{__cmd__package_inspect, __tauri_command_name_package_inspect, package_inspect};
pub use jobs::{__cmd__package_cancel, __tauri_command_name_package_cancel, package_cancel};
