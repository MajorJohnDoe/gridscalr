//! Managed-copy inventory and explicit orphan removal.
//!
//! The folder always comes from [`crate::source_copy::drawings_folder`], the
//! same helper that writes a managed copy, so listing and removal cannot drift
//! from the copy destination. Listing is non-recursive and includes only regular
//! `.pdf` files directly in that folder; a subfolder, a symbolic link or a file
//! with another extension is never offered for removal.
//!
//! Removal takes the leaf names the renderer verified and re-reads the folder
//! immediately before it moves a file. The renderer re-verifies the reference
//! set; the Rust side additionally guarantees that only a currently listed
//! regular file in this project's own drawings folder can be moved.
//!
//! A removed copy is never hard-deleted. The operating system trash is tried
//! first; when it is unavailable the file is moved into one timestamped
//! `.removed` folder inside the project folder, whose path is reported back. The
//! folder is hidden but the user can restore or delete it, so the app never
//! claims a file is gone when it is still recoverable.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::commands::{unique_sibling, CommandError};
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

/// Where one removed managed copy went.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RemovalDestination {
    /// The operating system trash or recycle bin accepted the file.
    Trash,
    /// The file was moved into the timestamped fallback folder.
    Folder,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedManagedCopy {
    pub file_name: String,
    pub destination: RemovalDestination,
}

/// The outcome of one explicit removal request.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCopyRemoval {
    pub removed: Vec<RemovedManagedCopy>,
    /// Names that were no longer listed when the folder was re-read.
    pub skipped: Vec<String>,
    /// Names that the file system refused to move.
    pub failed: Vec<String>,
    /// Set when at least one file went into the fallback folder.
    pub folder: Option<String>,
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

/// Refuses a target that is not this project's own regular file. `Ok(None)`
/// means the file vanished between the folder listing and this check. The
/// project file itself is protected even through a hard link or another
/// spelling.
fn verify_removable(
    folder: &Path,
    project_path: &Path,
    file_name: &str,
) -> Result<Option<PathBuf>, CommandError> {
    if !is_leaf_name(file_name) || !is_pdf(file_name) {
        return Err(CommandError::new("unsafePath", file_name.to_string()));
    }
    let target = folder.join(file_name);
    // The name is separator-free by the check above; this rejects a folder that
    // resolves somewhere else through a link in the path itself.
    ensure_inside_root(&target, folder, "unsafePath")?;
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(CommandError::new(
                "readFailed",
                format!("{file_name}: {error}"),
            ))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(CommandError::new("unsafePath", file_name.to_string()));
    }
    // A hard link is a second name for the same bytes. Moving it cannot destroy
    // the project file, but refusing keeps the guarantee easy to state.
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
    Ok(Some(target))
}

/// Creates the fallback folder once per request and returns it.
fn fallback_folder(project_path: &Path, slot: &mut Option<PathBuf>) -> Option<PathBuf> {
    if let Some(folder) = slot {
        return Some(folder.clone());
    }
    // The folder lives beside the project file, so the move never crosses a
    // volume. `unique_sibling` keeps two concurrent cleanups apart.
    let folder = unique_sibling(project_path, "removed");
    if fs::create_dir(&folder).is_err() {
        return None;
    }
    *slot = Some(folder.clone());
    Some(folder)
}

/// Removes the requested copies with the operating system trash.
pub(crate) fn remove_managed_copies_in(
    project_path: &Path,
    file_names: &[String],
) -> Result<ManagedCopyRemoval, CommandError> {
    remove_managed_copies_with(project_path, file_names, |path| trash::delete(path).is_ok())
}

/// Pure removal logic with the trash backend injected for tests. A `false`
/// result from `trash` is the "operating system trash unavailable" case; it is
/// not a failure, the fallback folder takes over.
pub(crate) fn remove_managed_copies_with(
    project_path: &Path,
    file_names: &[String],
    trash: impl Fn(&Path) -> bool,
) -> Result<ManagedCopyRemoval, CommandError> {
    // Every requested name is validated before anything moves, so a malformed
    // request can never remove part of the set.
    for name in file_names {
        if !is_leaf_name(name) || !is_pdf(name) {
            return Err(CommandError::new("unsafePath", name.to_string()));
        }
    }
    let (folder, _) = drawings_folder(project_path)?;
    // Re-reading the folder makes a stale renderer list harmless: a name that is
    // no longer a listed managed copy is skipped instead of moved.
    let listed = list_managed_copies_in(project_path)?;
    let mut report = ManagedCopyRemoval::default();
    let mut folder_slot: Option<PathBuf> = None;
    let mut handled: Vec<&str> = Vec::new();
    for name in file_names {
        if handled.contains(&name.as_str()) {
            continue;
        }
        handled.push(name);
        if !listed.iter().any(|entry| &entry.file_name == name) {
            report.skipped.push(name.clone());
            continue;
        }
        let target = match verify_removable(&folder, project_path, name) {
            Ok(Some(target)) => target,
            // A file that disappeared between the listing and this check is
            // skipped; an unsafe or unreadable target is reported as failed.
            Ok(None) => {
                report.skipped.push(name.clone());
                continue;
            }
            Err(_) => {
                report.failed.push(name.clone());
                continue;
            }
        };
        if trash(&target) {
            report.removed.push(RemovedManagedCopy {
                file_name: name.clone(),
                destination: RemovalDestination::Trash,
            });
            continue;
        }
        let Some(destination) = fallback_folder(project_path, &mut folder_slot) else {
            report.failed.push(name.clone());
            continue;
        };
        match fs::rename(&target, destination.join(name)) {
            Ok(()) => report.removed.push(RemovedManagedCopy {
                file_name: name.clone(),
                destination: RemovalDestination::Folder,
            }),
            Err(_) => report.failed.push(name.clone()),
        }
    }
    report.folder = folder_slot.map(|path| path.to_string_lossy().into_owned());
    Ok(report)
}

#[tauri::command]
pub fn source_list_managed_copies(
    project_path: String,
) -> Result<Vec<ManagedCopyEntry>, CommandError> {
    list_managed_copies_in(Path::new(&project_path))
}

/// Moves the explicitly selected unused copies out of the drawings folder. The
/// renderer decides which copies are unreferenced and re-verifies that set; a
/// name that is no longer a listed copy of this project is skipped.
#[tauri::command]
pub fn source_remove_managed_copies(
    project_path: String,
    file_names: Vec<String>,
) -> Result<ManagedCopyRemoval, CommandError> {
    remove_managed_copies_in(Path::new(&project_path), &file_names)
}

#[cfg(test)]
#[path = "source_cleanup_tests.rs"]
mod tests;
