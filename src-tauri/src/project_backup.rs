use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::commands::{replace_file, unique_sibling, write_flushed};
use crate::path_guard::MAX_PROJECT_BYTES;
use crate::project_write::{modified_ms, WriteError};

/// Rolling backups keep a small restore window in app data. The retention
/// preference is bounded here as well as in the preferences UI.
pub const MIN_BACKUP_RETENTION: usize = 2;
pub const MAX_BACKUP_RETENTION: usize = 10;

const MANIFEST_NAME: &str = "manifest.json";

/// One rolling project backup. Backups live in app data, keyed by project ID,
/// and are never part of a project package or the recent-file list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: i64,
    /// The project file path the backup was written from, when it was saved.
    pub project_path: Option<String>,
}

/// Optional metadata for one backup file. A missing or unreadable manifest only
/// costs the origin path; the backup file itself stays usable.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupMeta {
    project_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    version: u32,
    entries: BTreeMap<String, BackupMeta>,
}

impl Default for BackupManifest {
    fn default() -> Self {
        Self {
            version: 1,
            entries: BTreeMap::new(),
        }
    }
}

/// Keeps a retention value inside the documented range even when a renderer
/// sends something else.
pub fn clamp_retention(retention: usize) -> usize {
    retention.clamp(MIN_BACKUP_RETENTION, MAX_BACKUP_RETENTION)
}

fn safe_project_id(project_id: &str) -> String {
    let mut safe: String = project_id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty() {
        safe.push_str("unknown");
    }
    safe.truncate(80);
    safe
}

fn backup_root(app: &tauri::AppHandle) -> Result<PathBuf, WriteError> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| WriteError::new("appDataFolderFailed", error.to_string()))?;
    Ok(root.join("backups"))
}

fn backup_entry(path: PathBuf, project_path: Option<String>) -> Option<BackupEntry> {
    let metadata = fs::metadata(&path).ok()?;
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())?;
    Some(BackupEntry {
        path: path.to_string_lossy().into_owned(),
        file_name,
        size_bytes: metadata.len(),
        modified_at: modified_ms(&metadata),
        project_path,
    })
}

fn backup_directory(app: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, WriteError> {
    let directory = backup_root(app)?.join(safe_project_id(project_id));
    fs::create_dir_all(&directory)
        .map_err(|error| WriteError::new("backupFolderFailed", error.to_string()))?;
    Ok(directory)
}

fn existing_backup_directory(root: &Path, project_id: &str) -> PathBuf {
    root.join(safe_project_id(project_id))
}

fn backup_name_at(millis: u128) -> String {
    format!("backup-{millis:013}.gridscalr")
}

fn next_backup_name(directory: &Path) -> String {
    let base = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let mut millis = base;
    loop {
        let name = backup_name_at(millis);
        if !directory.join(&name).exists() {
            return name;
        }
        millis += 1;
    }
}

/// A command may only delete a generated backup in its own project folder.
fn valid_backup_name(file_name: &str) -> Option<&str> {
    if file_name.contains(['/', '\\']) || file_name == "." || file_name == ".." {
        return None;
    }
    if !file_name.starts_with("backup-") || !file_name.ends_with(".gridscalr") {
        return None;
    }
    Some(file_name)
}

fn backup_file_names(directory: &Path) -> std::io::Result<Vec<String>> {
    let mut names: Vec<String> = fs::read_dir(directory)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".gridscalr"))
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    Ok(names)
}

fn read_manifest(directory: &Path) -> BackupManifest {
    fs::read_to_string(directory.join(MANIFEST_NAME))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_manifest(directory: &Path, manifest: &BackupManifest) -> std::io::Result<()> {
    let target = directory.join(MANIFEST_NAME);
    let temp = unique_sibling(&target, "tmp");
    let json = serde_json::to_vec(manifest)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
    write_flushed(&temp, &json)?;
    fs::rename(&temp, &target)?;
    Ok(())
}

/// Removes the oldest rolling backups so only `keep` newest files remain.
fn rotate_backups(directory: &Path, keep: usize) -> std::io::Result<()> {
    let names = backup_file_names(directory)?;
    let remove = names.len().saturating_sub(keep);
    for name in names.into_iter().take(remove) {
        let _ = fs::remove_file(directory.join(name));
    }
    Ok(())
}

fn save_backup_in(
    directory: &Path,
    contents: &str,
    retention: usize,
    project_path: Option<String>,
) -> Result<BackupEntry, WriteError> {
    if contents.len() as u64 > MAX_PROJECT_BYTES {
        return Err(WriteError::new(
            "fileTooLarge",
            format!(
                "backup: {} bytes exceeds the {MAX_PROJECT_BYTES} byte project limit",
                contents.len()
            ),
        ));
    }
    let name = next_backup_name(directory);
    let target = directory.join(&name);
    let temp = unique_sibling(&target, "tmp");
    write_flushed(&temp, contents.as_bytes())
        .map_err(|error| WriteError::new("writeFailed", format!("{name}: {error}")))?;
    replace_file(&temp, &target, &name).map_err(WriteError::from)?;
    rotate_backups(directory, clamp_retention(retention))
        .map_err(|error| WriteError::new("backupRotateFailed", error.to_string()))?;

    let mut manifest = read_manifest(directory);
    if let Ok(names) = backup_file_names(directory) {
        manifest.entries.retain(|key, _| names.contains(key));
    }
    manifest.entries.insert(
        name.clone(),
        BackupMeta {
            project_path: project_path.clone(),
        },
    );
    // The manifest is an enrichment, never the source of truth. A failed write
    // leaves the backup listed without its origin path.
    let _ = write_manifest(directory, &manifest);

    backup_entry(target, project_path).ok_or_else(|| WriteError::new("backupReadFailed", name))
}

fn list_backups_in(directory: &Path) -> Result<Vec<BackupEntry>, WriteError> {
    let manifest = read_manifest(directory);
    let mut entries: Vec<BackupEntry> = fs::read_dir(directory)
        .map_err(|error| WriteError::new("backupReadFailed", error.to_string()))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".gridscalr"))
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let project_path = manifest
                .entries
                .get(&name)
                .and_then(|meta| meta.project_path.clone());
            backup_entry(entry.path(), project_path)
        })
        .collect();
    entries.sort_by(|left, right| right.file_name.cmp(&left.file_name));
    Ok(entries)
}

fn delete_backup_in(directory: &Path, file_name: &str) -> Result<(), WriteError> {
    let name = valid_backup_name(file_name)
        .ok_or_else(|| WriteError::new("backupDeleteInvalid", file_name.to_string()))?;
    let target = directory.join(name);
    if !target.is_file() {
        return Err(WriteError::new("backupDeleteMissing", name.to_string()));
    }
    fs::remove_file(&target)
        .map_err(|error| WriteError::new("backupDeleteFailed", error.to_string()))?;
    let mut manifest = read_manifest(directory);
    manifest.entries.remove(name);
    let _ = write_manifest(directory, &manifest);
    Ok(())
}

/// Renames the project's backup folder before removing it, so a failure cannot
/// leave half of the set listed for the project.
fn delete_all_in(directory: &Path) -> Result<(), WriteError> {
    if !directory.exists() {
        return Ok(());
    }
    let trash = unique_sibling(directory, "deleted");
    fs::rename(directory, &trash)
        .map_err(|error| WriteError::new("backupDeleteFailed", error.to_string()))?;
    // A leftover trash folder is no longer listed for the project. Removing it
    // is best effort and never changes the outcome of the delete.
    let _ = fs::remove_dir_all(&trash);
    Ok(())
}

#[tauri::command]
pub fn save_project_backup(
    app: tauri::AppHandle,
    project_id: String,
    contents: String,
    project_path: Option<String>,
    retention: usize,
) -> Result<BackupEntry, WriteError> {
    let directory = backup_directory(&app, &project_id)?;
    save_backup_in(&directory, &contents, retention, project_path)
}

#[tauri::command]
pub fn list_project_backups(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<BackupEntry>, WriteError> {
    let directory = backup_directory(&app, &project_id)?;
    list_backups_in(&directory)
}

#[tauri::command]
pub fn delete_project_backup(
    app: tauri::AppHandle,
    project_id: String,
    file_name: String,
) -> Result<(), WriteError> {
    let directory = backup_directory(&app, &project_id)?;
    delete_backup_in(&directory, &file_name)
}

#[tauri::command]
pub fn delete_all_project_backups(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<(), WriteError> {
    let root = backup_root(&app)?;
    let directory = existing_backup_directory(&root, &project_id);
    delete_all_in(&directory)
}

#[cfg(test)]
#[path = "project_backup_tests.rs"]
mod tests;
