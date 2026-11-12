//! Managed-copy inventory and explicit orphan deletion.
//!
//! The folder always comes from [`crate::source_copy::drawings_folder`], the
//! same helper that writes a managed copy, so listing and deletion cannot drift
//! from the copy destination. Listing is non-recursive and includes only regular
//! `.pdf` files directly in that folder; a subfolder, a symbolic link or a file
//! with another extension is never offered for deletion.
//!
//! Deletion takes one leaf name and re-checks the folder immediately before it
//! removes the file. The renderer decides which copies are unreferenced and
//! re-verifies that set; the Rust side additionally guarantees that only a
//! currently listed regular file in this project's own drawings folder can be
//! removed.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::commands::CommandError;
use crate::path_guard::{comparison_key, ensure_inside_root, resolved_path};
use crate::project_write::modified_ms;
use crate::source_copy::drawings_folder;

/// One regular PDF found directly in a project's drawings folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCopyEntry {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: i64,
}

fn is_pdf(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".pdf")
}

/// A leaf name that cannot name a parent directory, a separator or an
/// alternative data stream. The name is only ever joined to the drawings
/// folder after this check.
fn is_leaf_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains('\0')
}

pub(crate) fn list_managed_copies_in(
    project_path: &Path,
) -> Result<Vec<ManagedCopyEntry>, CommandError> {
    let (folder, _) = drawings_folder(project_path)?;
    let entries = match fs::read_dir(&folder) {
        Ok(entries) => entries,
        // A project without a managed copy has no folder yet. That is a normal
        // state, not an error.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(CommandError::new(
                "readFailed",
                format!("{}: {error}", folder.display()),
            ))
        }
    };
    let mut result: Vec<ManagedCopyEntry> = Vec::new();
    for entry in entries.flatten() {
        // `file_type` does not follow a symbolic link, so a link planted in the
        // folder is never listed or later described as a managed copy.
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_pdf(&name) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        result.push(ManagedCopyEntry {
            path: entry.path().to_string_lossy().into_owned(),
            file_name: name,
            size_bytes: metadata.len(),
            modified_at: modified_ms(&metadata),
        });
    }
    result.sort_by(|left, right| left.file_name.cmp(&right.file_name));
    Ok(result)
}

pub(crate) fn delete_managed_copy_in(
    project_path: &Path,
    file_name: &str,
) -> Result<(), CommandError> {
    if !is_leaf_name(file_name) || !is_pdf(file_name) {
        return Err(CommandError::new("unsafePath", file_name.to_string()));
    }
    let (folder, _) = drawings_folder(project_path)?;
    // Re-reading the folder makes a stale renderer list harmless: a name that is
    // no longer a listed managed copy is refused instead of removed.
    let listed = list_managed_copies_in(project_path)?;
    if !listed.iter().any(|entry| entry.file_name == file_name) {
        return Err(CommandError::new(
            "readFailed",
            format!("{file_name}: not a managed copy in this project"),
        ));
    }
    let target = folder.join(file_name);
    // The name is separator-free by the check above; this rejects a folder that
    // resolves somewhere else through a link in the path itself.
    ensure_inside_root(&target, &folder, "unsafePath")?;
    let metadata = fs::symlink_metadata(&target)
        .map_err(|error| CommandError::new("readFailed", format!("{file_name}: {error}")))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(CommandError::new("unsafePath", file_name.to_string()));
    }
    // A hard link is a second name for the same bytes. Removing it cannot
    // destroy the project file, but refusing keeps the guarantee easy to state.
    let project_name = project_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    if project_name.eq_ignore_ascii_case(file_name)
        || same_file::is_same_file(&target, project_path).unwrap_or(false)
        || comparison_key(&resolved_path(&target)) == comparison_key(&resolved_path(project_path))
    {
        return Err(CommandError::new("sourceOverwrite", file_name.to_string()));
    }
    fs::remove_file(&target)
        .map_err(|error| CommandError::new("writeFailed", format!("{file_name}: {error}")))?;
    Ok(())
}

#[tauri::command]
pub fn source_list_managed_copies(
    project_path: String,
) -> Result<Vec<ManagedCopyEntry>, CommandError> {
    list_managed_copies_in(Path::new(&project_path))
}

#[tauri::command]
pub fn source_delete_managed_copy(
    project_path: String,
    file_name: String,
) -> Result<(), CommandError> {
    delete_managed_copy_in(Path::new(&project_path), &file_name)
}

#[cfg(test)]
#[path = "source_cleanup_tests.rs"]
mod tests;
