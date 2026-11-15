//! Verified writes of the derived-PDF cache for a colour TIF scan (schema 27).
//!
//! The cache is an artifact, never a source of truth: a derived PDF built from
//! a scan is written to `<project folder>/<stem>.derived/` so it travels with
//! the project the way a managed copy does, and the project JSON only carries a
//! marker naming it. Deleting the folder costs a rebuild from the scan, never a
//! page.
//!
//! The destination folder is derived here from the project path, not supplied by
//! the caller, so a cache can only ever be written beside its own project. The
//! payload is decoded, size-checked, written to a flushed temporary sibling and
//! renamed once; the final file is hashed and compared with the payload before
//! the path is reported. A source path is never opened for writing: the caller's
//! protected paths are checked before anything is created.

use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::commands::{replace_file, unique_sibling, write_flushed, CommandError};
use crate::path_guard::{ensure_writable, is_inside, too_large};
use crate::source_copy::{is_sha256, project_folder, project_stem};
use crate::temp_cleanup::clean_stale_temporaries;

/// A derived PDF cannot be larger than the whole project limit: a cache above
/// it could never be part of a saveable project. The byte cap is checked before
/// the payload is decoded so a hostile request is refused cheaply.
pub(crate) const MAX_DERIVED_CACHE_BYTES: u64 = 256 * 1024 * 1024;

/// The one cache folder for a project: `<project folder>/<stem>.derived`.
///
/// Like the managed-copy folder it is resolved inside the project folder, so a
/// symlinked or junctioned folder that escapes it is refused instead of
/// followed.
pub(crate) fn derived_cache_folder(project_path: &Path) -> Result<(PathBuf, String), CommandError> {
    let folder = project_folder(project_path)?;
    let name = format!("{}.derived", project_stem(project_path));
    let cache_folder = folder.join(&name);
    crate::path_guard::ensure_inside_root(&cache_folder, &folder, "unsafePath")?;
    Ok((cache_folder, name))
}

/// The cache file name is the key shape: source hash prefix, converter version
/// and page count. Two documents that share one scan therefore share one cache,
/// and a rebuilt cache for a changed key never overwrites a file another marker
/// still names.
pub(crate) fn cache_file_name(
    source_sha256: &str,
    converter_version: u32,
    page_count: u32,
) -> String {
    format!(
        "{}-v{}-p{}.pdf",
        &source_sha256[..16],
        converter_version,
        page_count
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedCacheRequest {
    pub project_path: String,
    pub source_sha256: String,
    pub converter_version: u32,
    pub page_count: u32,
    pub data_base64: String,
    #[serde(default)]
    pub protected_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedCacheInfo {
    pub destination_path: String,
    pub relative_path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

fn hash_file(path: &Path) -> Result<String, CommandError> {
    let mut file = File::open(path)
        .map_err(|error| CommandError::new("readFailed", format!("{}: {error}", path.display())))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            CommandError::new("readFailed", format!("{}: {error}", path.display()))
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let digest = hasher.finalize();
    let mut text = String::with_capacity(digest.len() * 2);
    for byte in digest {
        text.push_str(&format!("{byte:02x}"));
    }
    Ok(text)
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut text = String::with_capacity(digest.len() * 2);
    for byte in digest {
        text.push_str(&format!("{byte:02x}"));
    }
    text
}

fn is_pdf(bytes: &[u8]) -> bool {
    bytes.starts_with(b"%PDF-")
}

/// Writes one derived PDF into this project's cache folder and reports the
/// verified path. The same key with the same bytes reuses the existing file.
pub(crate) fn write_derived_cache(
    request: &DerivedCacheRequest,
) -> Result<DerivedCacheInfo, CommandError> {
    if !is_sha256(&request.source_sha256) {
        return Err(CommandError::new(
            "invalidPayload",
            "sourceSha256 is not a SHA-256 value",
        ));
    }
    if request.converter_version < 1 || request.page_count < 1 {
        return Err(CommandError::new(
            "invalidPayload",
            "converterVersion and pageCount must be positive integers",
        ));
    }
    let encoded = request.data_base64.trim();
    if encoded.is_empty() {
        return Err(CommandError::new("invalidPayload", "dataBase64 is empty"));
    }
    // base64 inflates by 4/3; refuse an impossible payload before decoding it.
    if encoded.len() as u64 > MAX_DERIVED_CACHE_BYTES / 3 * 4 + 4 {
        return Err(too_large(
            Path::new("derived cache"),
            encoded.len() as u64,
            MAX_DERIVED_CACHE_BYTES,
        ));
    }
    let data = base64::engine::general_purpose::STANDARD
        .decode(encoded.as_bytes())
        .map_err(|error| CommandError::new("invalidPayload", error.to_string()))?;
    if data.len() as u64 > MAX_DERIVED_CACHE_BYTES {
        return Err(too_large(
            Path::new("derived cache"),
            data.len() as u64,
            MAX_DERIVED_CACHE_BYTES,
        ));
    }
    if !is_pdf(&data) {
        return Err(CommandError::new(
            "invalidPayload",
            "a derived cache must be a PDF",
        ));
    }

    let project_path = Path::new(&request.project_path);
    let (folder, folder_name) = derived_cache_folder(project_path)?;
    let file_name = cache_file_name(
        &request.source_sha256,
        request.converter_version,
        request.page_count,
    );
    let destination = folder.join(&file_name);
    ensure_writable(&destination.to_string_lossy(), &request.protected_paths)?;
    for protected in request
        .protected_paths
        .iter()
        .filter(|path| !path.trim().is_empty())
    {
        if is_inside(&destination, Path::new(protected)) {
            return Err(CommandError::new(
                "sourceOverwrite",
                format!("{}: inside a protected source path", destination.display()),
            ));
        }
    }

    let expected = hash_bytes(&data);
    if destination.exists() {
        let existing = hash_file(&destination)?;
        if existing != expected {
            // The same key produced different bytes: the cached file is stale or
            // corrupt. It is the cache's own file, so replacing it is the repair.
            fs::remove_file(&destination).map_err(|error| {
                CommandError::new("writeFailed", format!("{}: {error}", destination.display()))
            })?;
        }
    }
    if !destination.exists() {
        fs::create_dir_all(&folder).map_err(|error| {
            CommandError::new(
                "createFolderFailed",
                format!("{}: {error}", folder.display()),
            )
        })?;
        clean_stale_temporaries(&destination);
        let temp = unique_sibling(&destination, "cache");
        if let Err(error) = write_flushed(&temp, &data) {
            let _ = fs::remove_file(&temp);
            return Err(CommandError::new(
                "writeFailed",
                format!("{}: {error}", destination.display()),
            ));
        }
        if let Err(error) = replace_file(&temp, &destination, &file_name) {
            return Err(error);
        }
    }

    let final_hash = hash_file(&destination)?;
    let final_size = fs::metadata(&destination)
        .map_err(|error| {
            CommandError::new("readFailed", format!("{}: {error}", destination.display()))
        })?
        .len();
    if final_hash != expected || final_size != data.len() as u64 {
        return Err(CommandError::new(
            "readBackMismatch",
            format!("{}: the cache did not verify", destination.display()),
        ));
    }

    Ok(DerivedCacheInfo {
        destination_path: destination.to_string_lossy().to_string(),
        relative_path: format!("{folder_name}/{file_name}"),
        sha256: final_hash,
        size_bytes: final_size,
    })
}

#[tauri::command]
pub fn derived_cache_write(request: DerivedCacheRequest) -> Result<DerivedCacheInfo, CommandError> {
    write_derived_cache(&request)
}

#[cfg(test)]
#[path = "derived_cache_tests.rs"]
mod tests;
