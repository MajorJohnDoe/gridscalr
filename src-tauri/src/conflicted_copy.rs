//! Conflicted copies written beside a project by a conditional save.
//!
//! A copy is never stored anywhere else: it is an ordinary sibling file that
//! matches the exact naming rule in `features/saveIntegrity/stamp.ts`
//! (`<project> (conflicted copy YYYY-MM-DD HHMM).gridscalr`, with an optional
//! attempt number). Discovery is deliberately strict so a look-alike file in
//! the folder is never listed, deleted or described as a conflicted copy.
//! Deletion is explicit, single-file and refuses a symlink, a name outside the
//! project folder and the open project's own file.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::path_guard::{comparison_key, ensure_inside_root, resolved_path};
use crate::project_write::{modified_ms, WriteError};

const PROJECT_EXTENSION: &str = ".gridscalr";
const COPY_MARKER: &str = " (conflicted copy ";
const STAMP_LENGTH: usize = 15;

/// One conflicted copy found in the project's folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictedCopyEntry {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: i64,
}

fn has_project_extension(name: &str) -> bool {
    name.len() >= PROJECT_EXTENSION.len()
        && name[name.len() - PROJECT_EXTENSION.len()..].eq_ignore_ascii_case(PROJECT_EXTENSION)
}

/// The stem the save flow uses. It mirrors `conflictedCopyPath` on the
/// frontend: a `.gridscalr` extension is removed, any other extension stays,
/// and an empty stem falls back to `project`.
fn project_stem(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_string_lossy().to_string();
    if name.is_empty() {
        return None;
    }
    let stem = if has_project_extension(&name) {
        name[..name.len() - PROJECT_EXTENSION.len()].to_string()
    } else {
        name
    };
    Some(if stem.is_empty() {
        "project".to_string()
    } else {
        stem
    })
}

fn is_digit(byte: u8) -> bool {
    byte.is_ascii_digit()
}

fn is_stamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == STAMP_LENGTH
        && bytes[..4].iter().all(|byte| is_digit(*byte))
        && bytes[4] == b'-'
        && bytes[5..7].iter().all(|byte| is_digit(*byte))
        && bytes[7] == b'-'
        && bytes[8..10].iter().all(|byte| is_digit(*byte))
        && bytes[10] == b' '
        && bytes[11..15].iter().all(|byte| is_digit(*byte))
}

/// The attempt suffix is a bare number starting at 2. Accepting `1` would also
/// be safe, but the generator never writes it, so it stays out.
fn is_attempt(value: &str) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty() && bytes[0] != b'0' && bytes.iter().all(|byte| is_digit(*byte))
}

/// True only for a file name this app writes for `stem`. The check is a prefix
/// comparison, never a glob or a regular expression built from the project name.
pub(crate) fn is_conflicted_copy_name(file_name: &str, stem: &str) -> bool {
    if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') {
        return false;
    }
    let prefix = format!("{stem}{COPY_MARKER}");
    if !file_name.starts_with(&prefix) || !has_project_extension(file_name) {
        return false;
    }
    let extension = PROJECT_EXTENSION.len();
    if file_name.len() < prefix.len() + extension + 1 {
        return false;
    }
    let closing = file_name.len() - extension - 1;
    if file_name.as_bytes()[closing] != b')' {
        return false;
    }
    let inner = &file_name[prefix.len()..closing];
    if inner.len() < STAMP_LENGTH || !is_stamp(&inner[..STAMP_LENGTH]) {
        return false;
    }
    let rest = &inner[STAMP_LENGTH..];
    match rest.strip_prefix(' ') {
        Some(attempt) => is_attempt(attempt),
        None => rest.is_empty(),
    }
}

fn parent_folder(path: &Path) -> PathBuf {
    match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    }
}

pub(crate) fn list_conflicted_copies_in(
    project_path: &Path,
) -> Result<Vec<ConflictedCopyEntry>, WriteError> {
    let stem = project_stem(project_path).ok_or_else(|| {
        WriteError::new(
            "readFailed",
            format!("{}: not a project file", project_path.display()),
        )
    })?;
    let directory = parent_folder(project_path);
    let entries = fs::read_dir(&directory).map_err(|error| {
        WriteError::new("readFailed", format!("{}: {error}", directory.display()))
    })?;
    let mut result: Vec<ConflictedCopyEntry> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_conflicted_copy_name(&name, &stem) {
            continue;
        }
        // `file_type` does not follow a symlink, so a link planted in the
        // folder is never listed or later described as a regular file.
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        result.push(ConflictedCopyEntry {
            path: entry.path().to_string_lossy().into_owned(),
            file_name: name,
            size_bytes: metadata.len(),
            modified_at: modified_ms(&metadata),
        });
    }
    result.sort_by(|left, right| {
        right
            .modified_at
            .cmp(&left.modified_at)
            .then_with(|| right.file_name.cmp(&left.file_name))
    });
    Ok(result)
}

pub(crate) fn delete_conflicted_copy_in(
    project_path: &Path,
    file_name: &str,
) -> Result<(), WriteError> {
    let stem = project_stem(project_path).ok_or_else(|| {
        WriteError::new(
            "unsafePath",
            format!("{}: not a project file", project_path.display()),
        )
    })?;
    if !is_conflicted_copy_name(file_name, &stem) {
        return Err(WriteError::new(
            "unsafePath",
            format!("{file_name}: not a conflicted copy of this project"),
        ));
    }
    let project_name = project_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    if project_name.eq_ignore_ascii_case(file_name) {
        return Err(WriteError::new("sourceOverwrite", file_name.to_string()));
    }
    let directory = parent_folder(project_path);
    let target = directory.join(file_name);
    // The name is separator-free by the check above; this rejects a folder that
    // resolves somewhere else through a link in the path itself.
    ensure_inside_root(&target, &directory, "unsafePath")?;
    let metadata = fs::symlink_metadata(&target)
        .map_err(|error| WriteError::new("readFailed", format!("{file_name}: {error}")))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(WriteError::new("unsafePath", file_name.to_string()));
    }
    // A hard link is a second name for the same bytes. Removing it cannot
    // destroy the project file, but refusing keeps the guarantee easy to state.
    if same_file::is_same_file(&target, project_path).unwrap_or(false) {
        return Err(WriteError::new("sourceOverwrite", file_name.to_string()));
    }
    let target_key = comparison_key(&resolved_path(&target));
    if target_key == comparison_key(&resolved_path(project_path)) {
        return Err(WriteError::new("sourceOverwrite", file_name.to_string()));
    }
    fs::remove_file(&target)
        .map_err(|error| WriteError::new("writeFailed", format!("{file_name}: {error}")))?;
    Ok(())
}

#[tauri::command]
pub fn list_conflicted_copies(
    project_path: String,
) -> Result<Vec<ConflictedCopyEntry>, WriteError> {
    list_conflicted_copies_in(Path::new(&project_path))
}

#[tauri::command]
pub fn delete_conflicted_copy(project_path: String, file_name: String) -> Result<(), WriteError> {
    delete_conflicted_copy_in(Path::new(&project_path), &file_name)
}

#[cfg(test)]
#[path = "conflicted_copy_tests.rs"]
mod tests;
