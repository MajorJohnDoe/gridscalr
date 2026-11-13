//! Shared path comparison and bounded-read rules for every filesystem command.
//!
//! The write guard exists for one reason: a source drawing must never be
//! overwritten. Comparisons are therefore deliberately conservative. Both
//! sides are resolved to an absolute path, every existing prefix is
//! canonicalized (symlinks and junctions), hard links are detected by file
//! identity and the final key is case-folded with forward slashes. A false
//! positive only asks the user to choose another name; a false negative would
//! destroy source material.
//!
//! When a case-insensitive comparison meets two *distinct* files on a
//! case-sensitive file system, the guard refuses rather than assuming which
//! one the user meant. That is the safe direction and is covered by a test.

use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use crate::commands::CommandError;

/// A project file, a backup and a packaged project are all bounded by the same
/// documented limit. It is chosen well above the 150-page reference project.
pub(crate) const MAX_PROJECT_BYTES: u64 = 256 * 1024 * 1024;

/// One opened source PDF/TIF. This is a memory guard, not a policy on drawing
/// size; a document above it fails with a structured `fileTooLarge` error.
pub(crate) const MAX_SOURCE_BYTES: u64 = 1024 * 1024 * 1024;

/// Total bytes hashed by one `source_find_by_hash` search.
pub(crate) const MAX_HASH_SCAN_BYTES: u64 = 2 * 1024 * 1024 * 1024;

fn is_usable(path: &Path) -> bool {
    let text = path.to_string_lossy();
    !text.trim().is_empty() && !text.contains('\0')
}

/// A Windows drive-relative path such as `C:Plan.pdf` resolves against the
/// per-drive current directory, which the guard cannot know. It is rejected
/// rather than assumed to be a different file.
fn is_drive_relative(path: &Path) -> bool {
    let text = path.to_string_lossy();
    let mut characters = text.chars();
    let Some(drive) = characters.next() else {
        return false;
    };
    if !drive.is_ascii_alphabetic() || characters.next() != Some(':') {
        return false;
    }
    !matches!(characters.next(), Some('/') | Some('\\'))
}

/// A UNC spelling is anchored to its server, never to the local process
/// directory, on every platform the guard runs on.
fn has_unc_prefix(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.starts_with("//") || text.starts_with("\\\\")
}

/// The guard is also used to compare a project written on one platform with
/// the current one. On a non-Windows host a backslash is not a separator, so the
/// spelling is normalised before it is resolved. Both sides go through the same
/// normalisation, so a protected source stays protected.
#[cfg(not(windows))]
fn normalized_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if text.contains('\\') {
        PathBuf::from(text.replace('\\', "/"))
    } else {
        path.to_path_buf()
    }
}

#[cfg(windows)]
fn normalized_path(path: &Path) -> PathBuf {
    path.to_path_buf()
}

/// Resolves every existing part of the path, including symlinks and junctions,
/// and keeps the missing tail so a not-yet-created save target still compares
/// against its real parent folder. A relative path is anchored to the current
/// directory, so two spellings of one file always produce the same key.
///
/// `.` and `..` are resolved before the file system is asked. Without that, an
/// alternate spelling whose prefix cannot be opened as one path — the usual
/// case, because the component before `..` need not exist — would skip the
/// canonical prefix entirely and stop matching the plain spelling. macOS also
/// makes the difference visible: `/var` is a symlink to `/private/var`.
pub(crate) fn resolved_path(path: &Path) -> PathBuf {
    let path = normalized_path(path);
    let absolute = if path.is_absolute() || has_unc_prefix(&path) {
        path.to_path_buf()
    } else {
        match std::env::current_dir() {
            Ok(directory) => directory.join(&path),
            Err(_) => path.to_path_buf(),
        }
    };
    let absolute = lexical_path(&absolute);
    if let Ok(resolved) = fs::canonicalize(&absolute) {
        return resolved;
    }
    let mut existing = absolute.clone();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    while let Some(name) = existing.file_name() {
        tail.push(name.to_os_string());
        let Some(parent) = existing.parent() else {
            break;
        };
        existing = if parent.as_os_str().is_empty() {
            PathBuf::from(".")
        } else {
            parent.to_path_buf()
        };
        if let Ok(resolved) = fs::canonicalize(&existing) {
            let mut result = resolved;
            for part in tail.iter().rev() {
                result.push(part);
            }
            return result;
        }
    }
    absolute
}

fn lexical_path(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            other => result.push(other.as_os_str()),
        }
    }
    result
}

/// Case-insensitive key with forward slashes. Windows canonical paths carry a
/// `\\?\` verbatim prefix that an unresolved protected path does not, so the
/// prefix is stripped before comparing. Drive letters keep their colon, which
/// also distinguishes a drive-relative path from a rooted one.
pub(crate) fn comparison_key(path: &Path) -> String {
    let mut text = path.to_string_lossy().replace('\\', "/");
    let lower = text.to_ascii_lowercase();
    let mut key = String::with_capacity(text.len());
    let mut previous_slash = false;
    for character in text.chars() {
        if character == '/' {
            if previous_slash {
                continue;
            }
            previous_slash = true;
        } else {
            previous_slash = false;
        }
        key.extend(character.to_lowercase());
    }
    while key.ends_with('/') && key.len() > 1 {
        key.pop();
    }
    key
}

/// True when `path` is `root` or lives below it. Both sides are resolved first.
pub(crate) fn is_inside(path: &Path, root: &Path) -> bool {
    let target = comparison_key(&resolved_path(path));
    let base = comparison_key(&resolved_path(root));
    target == base || target.starts_with(&format!("{base}/"))
}

/// A protected path is also a protected *root* when it is an existing folder or
/// a managed-copy folder (which may not exist until the first copy is made).
fn is_protected_root(path: &Path) -> bool {
    if path.is_dir() {
        return true;
    }
    path.file_name()
        .map(|name| name.to_string_lossy().to_lowercase().ends_with(".drawings"))
        .unwrap_or(false)
}

pub(crate) fn too_large(path: &Path, size: u64, max: u64) -> CommandError {
    CommandError::new(
        "fileTooLarge",
        format!(
            "{}: {size} bytes exceeds the {max} byte limit",
            path.display()
        ),
    )
}

/// Reads at most `max` bytes. The size is checked before allocating and the
/// read is bounded, so a file that grows between the two checks still fails.
pub(crate) fn read_limited(path: &Path, max: u64) -> Result<Vec<u8>, CommandError> {
    let metadata = fs::metadata(path)
        .map_err(|error| CommandError::new("readFailed", format!("{}: {error}", path.display())))?;
    if !metadata.is_file() {
        return Err(CommandError::new("notAFile", path.display().to_string()));
    }
    if metadata.len() > max {
        return Err(too_large(path, metadata.len(), max));
    }
    let file = File::open(path)
        .map_err(|error| CommandError::new("readFailed", format!("{}: {error}", path.display())))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| CommandError::new("readFailed", format!("{}: {error}", path.display())))?;
    if bytes.len() as u64 > max {
        return Err(too_large(path, bytes.len() as u64, max));
    }
    Ok(bytes)
}

pub(crate) fn read_text_limited(path: &Path, max: u64) -> Result<String, CommandError> {
    let bytes = read_limited(path, max)?;
    String::from_utf8(bytes)
        .map_err(|_| CommandError::new("readFailed", format!("{}: not UTF-8", path.display())))
}

/// Refuses a write when the target is a protected source file, lives inside a
/// protected folder such as a managed-copy folder, or is an unusable path.
pub(crate) fn ensure_writable(path: &str, protected_paths: &[String]) -> Result<(), CommandError> {
    let target = Path::new(path);
    if !is_usable(target) {
        return Err(CommandError::new(
            "invalidPath",
            "empty or invalid target path",
        ));
    }
    if is_drive_relative(target) {
        return Err(CommandError::new(
            "invalidPath",
            "drive-relative target paths are ambiguous",
        ));
    }
    let target_resolved = resolved_path(target);
    let target_key = comparison_key(&target_resolved);

    for source in protected_paths {
        if source.trim().is_empty() {
            continue;
        }
        let source_path = Path::new(source.as_str());
        if !is_usable(source_path) {
            return Err(CommandError::new(
                "invalidPath",
                "empty or invalid protected path",
            ));
        }
        let source_resolved = resolved_path(source_path);
        if comparison_key(&source_resolved) == target_key {
            return Err(CommandError::new("sourceOverwrite", ""));
        }
        // Canonical paths miss hard links, which are a second name for the same
        // file. Comparing file identities closes that gap when both exist.
        if target.exists() && same_file::is_same_file(target, source_path).unwrap_or(false) {
            return Err(CommandError::new("sourceOverwrite", ""));
        }
        if is_protected_root(source_path) && is_inside(&target_resolved, &source_resolved) {
            return Err(CommandError::new(
                "sourceOverwrite",
                format!("{}: inside a protected folder", target.display()),
            ));
        }
    }
    Ok(())
}

/// Rejects a managed-copy folder or package destination whose resolved path
/// escapes the folder it is supposed to live in.
pub(crate) fn ensure_inside_root(
    path: &Path,
    root: &Path,
    code: &'static str,
) -> Result<(), CommandError> {
    if is_inside(path, root) {
        return Ok(());
    }
    Err(CommandError::new(
        code,
        format!("{} resolves outside {}", path.display(), root.display()),
    ))
}

#[cfg(test)]
#[path = "path_guard_tests.rs"]
mod tests;
