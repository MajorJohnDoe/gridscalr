//! Staging folders for one extraction.
//!
//! Extraction writes into a uniquely named sibling folder and renames it into
//! place. The [`TempDirectory`] guard removes the staging folder on every error
//! path unless the rename succeeded. A replaced destination is first moved to a
//! `previous` sibling that the app removes only after the new folder is in place.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// A staging folder that removes itself unless it was moved into place.
pub(crate) struct TempDirectory {
    pub(crate) path: PathBuf,
    pub(crate) keep: bool,
}

impl Drop for TempDirectory {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

/// `.<destination name>.<marker>-<pid>-<stamp>` next to the destination.
fn unique_folder(parent: &Path, destination: &Path, marker: &str) -> PathBuf {
    parent.join(format!(
        ".{}.{marker}-{}-{}",
        destination
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "gridscalr".to_string()),
        std::process::id(),
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    ))
}

pub(crate) fn extraction_folder(parent: &Path, destination: &Path) -> PathBuf {
    unique_folder(parent, destination, "extract")
}

pub(crate) fn previous_folder(parent: &Path, destination: &Path) -> PathBuf {
    unique_folder(parent, destination, "previous")
}
