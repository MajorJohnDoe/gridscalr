//! Hand an exported drawing PDF to the user's local mail client.
//!
//! The drawing PDF is built by the same frontend export path as
//! **File -> Export -> Drawing PDF**, written into an app-owned outbox in the
//! cache directory and only then handed to a mail client. A source drawing can
//! never pass the path guard: the file must exist, end in `.pdf` and resolve
//! inside `mail-outbox`.
//!
//! Every launch uses `std::process::Command` with an argument array. There is no
//! shell string, no interpolation and no opener plugin.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use base64::Engine;
use serde::Serialize;
use tauri::Manager;

use crate::commands::CommandError;
use crate::mail_launch::{launch_mail, reveal_file, LaunchFailure};
use crate::path_guard::ensure_inside_root;

/// Folder inside the app cache that holds the exported mail attachments.
pub(crate) const OUTBOX_FOLDER: &str = "mail-outbox";

/// New mail exports push out the oldest ones beyond this count.
pub(crate) const OUTBOX_KEEP: usize = 10;

/// Absolute memory guard for one attachment. The 20 MB guide is a frontend
/// warning with an explicit continue, not a hard refusal.
pub(crate) const MAX_COMPOSE_BYTES: u64 = 256 * 1024 * 1024;

/// The structured launch outcome the frontend maps to a localized message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ComposeStatus {
    Draft,
    NoClient,
    Failed,
}

/// Always carries the written path, including when no client opened it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeOutcome {
    pub status: ComposeStatus,
    pub path: String,
    pub detail: String,
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Keeps only a safe leaf stem, so a caller cannot choose a directory or an
/// extension other than `.pdf`.
pub(crate) fn safe_pdf_file_name(requested: &str) -> String {
    let leaf = Path::new(requested)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let stem = leaf.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(leaf);
    let cleaned: String = stem
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches(|character| matches!(character, '.' | '_' | '-'));
    let stem = if trimmed.is_empty() {
        "drawing"
    } else {
        trimmed
    };
    format!("{stem}.pdf")
}

/// The 20 MB warning lives in the frontend; this is the absolute memory bound.
pub(crate) fn ensure_compose_size(bytes: u64) -> Result<(), CommandError> {
    if bytes > MAX_COMPOSE_BYTES {
        return Err(CommandError::new(
            "mailTooLarge",
            format!("{bytes} bytes exceeds the {MAX_COMPOSE_BYTES} byte mail limit"),
        ));
    }
    Ok(())
}

/// The file must exist, be a PDF and resolve inside the app-owned outbox. A
/// symlink that escapes the folder fails the resolve, and so does a source
/// drawing.
pub(crate) fn guard_export(outbox: &Path, candidate: &Path) -> Result<(), CommandError> {
    let metadata = std::fs::metadata(candidate)
        .map_err(|_| CommandError::new("mailFileMissing", path_text(candidate)))?;
    if !metadata.is_file() {
        return Err(CommandError::new("notAFile", path_text(candidate)));
    }
    let is_pdf = candidate
        .extension()
        .map(|extension| extension.to_string_lossy().eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err(CommandError::new("mailNotPdf", path_text(candidate)));
    }
    ensure_inside_root(candidate, outbox, "mailOutsideOutbox")
}

fn mail_outbox<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, CommandError> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| CommandError::new("cacheFolderFailed", error.to_string()))?;
    let folder = cache.join(OUTBOX_FOLDER);
    std::fs::create_dir_all(&folder)
        .map_err(|error| CommandError::new("mailOutboxFailed", error.to_string()))?;
    Ok(folder)
}

/// Keeps the newest `keep` PDFs and removes the rest. The folder is app-owned,
/// so no user file ever lives there.
pub(crate) fn prune_outbox(outbox: &Path, keep: usize) -> usize {
    let Ok(entries) = std::fs::read_dir(outbox) else {
        return 0;
    };
    let mut files: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
        })
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .ends_with(".pdf")
        })
        .map(|entry| {
            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            (modified, entry.path())
        })
        .collect();
    files.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| right.1.cmp(&left.1)));
    let mut removed = 0;
    for (_, path) in files.into_iter().skip(keep) {
        if std::fs::remove_file(path).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Prunes the outbox when the app starts, before the first new export.
pub(crate) fn prune_mail_outbox_at_start<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Ok(cache) = app.path().app_cache_dir() {
        prune_outbox(&cache.join(OUTBOX_FOLDER), OUTBOX_KEEP);
    }
}

/// Writes the attachment, prunes the folder and opens a local mail client.
/// `(async)` keeps a mail client's compose dialog off the UI thread.
#[tauri::command(async)]
pub fn compose_mail(
    app: tauri::AppHandle,
    file_name: String,
    pdf_base64: String,
    subject: String,
    body: String,
) -> Result<ComposeOutcome, CommandError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(pdf_base64.as_bytes())
        .map_err(|error| CommandError::new("invalidPayload", error.to_string()))?;
    ensure_compose_size(bytes.len() as u64)?;
    let outbox = mail_outbox(&app)?;
    let target = outbox.join(safe_pdf_file_name(&file_name));
    crate::commands::atomic_write(&target, &bytes)?;
    prune_outbox(&outbox, OUTBOX_KEEP);
    let (status, detail) = launch_mail(&target, &subject, &body);
    Ok(ComposeOutcome {
        status,
        path: path_text(&target),
        detail,
    })
}

/// Reveals a previous mail attachment in the OS file manager, under the same
/// outbox guard as the compose step.
#[tauri::command(async)]
pub fn reveal_export(app: tauri::AppHandle, path: String) -> Result<(), CommandError> {
    let outbox = mail_outbox(&app)?;
    let candidate = PathBuf::from(&path);
    guard_export(&outbox, &candidate)?;
    match reveal_file(&candidate) {
        Ok(()) => Ok(()),
        Err(LaunchFailure::NotFound) => Err(CommandError::new("revealUnavailable", "")),
        Err(LaunchFailure::Exited(detail)) => Err(CommandError::new("revealFailed", detail)),
    }
}

#[cfg(test)]
#[path = "mail_send_tests.rs"]
mod tests;
