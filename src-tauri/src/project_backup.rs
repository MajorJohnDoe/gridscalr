use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Manager;

use crate::commands::{replace_file, unique_sibling, write_flushed};
use crate::path_guard::MAX_PROJECT_BYTES;
use crate::project_write::{modified_ms, WriteError};

/// One rolling project backup. Backups live in app data, keyed by project ID,
/// and are never part of a project package or the recent-file list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: i64,
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

fn backup_entry(path: PathBuf) -> Option<BackupEntry> {
    let metadata = fs::metadata(&path).ok()?;
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())?;
    Some(BackupEntry {
        path: path.to_string_lossy().into_owned(),
        file_name,
        size_bytes: metadata.len(),
        modified_at: modified_ms(&metadata),
    })
}

fn backup_directory(app: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, WriteError> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| WriteError::new("appDataFolderFailed", error.to_string()))?;
    let directory = root.join("backups").join(safe_project_id(project_id));
    fs::create_dir_all(&directory)
        .map_err(|error| WriteError::new("backupFolderFailed", error.to_string()))?;
    Ok(directory)
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

/// Removes the oldest rolling backups so only `keep` newest files remain.
fn rotate_backups(directory: &Path, keep: usize) -> std::io::Result<()> {
    let mut names: Vec<String> = fs::read_dir(directory)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".gridscalr"))
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    let remove = names.len().saturating_sub(keep);
    for name in names.into_iter().take(remove) {
        let _ = fs::remove_file(directory.join(name));
    }
    Ok(())
}

#[tauri::command]
pub fn save_project_backup(
    app: tauri::AppHandle,
    project_id: String,
    contents: String,
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
    let directory = backup_directory(&app, &project_id)?;
    let name = next_backup_name(&directory);
    let target = directory.join(&name);
    let temp = unique_sibling(&target, "tmp");
    write_flushed(&temp, contents.as_bytes())
        .map_err(|error| WriteError::new("writeFailed", format!("{name}: {error}")))?;
    replace_file(&temp, &target, &name).map_err(WriteError::from)?;
    rotate_backups(&directory, 3)
        .map_err(|error| WriteError::new("backupRotateFailed", error.to_string()))?;
    backup_entry(target).ok_or_else(|| WriteError::new("backupReadFailed", name))
}

#[tauri::command]
pub fn list_project_backups(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<BackupEntry>, WriteError> {
    let directory = backup_directory(&app, &project_id)?;
    let mut entries: Vec<BackupEntry> = fs::read_dir(&directory)
        .map_err(|error| WriteError::new("backupReadFailed", error.to_string()))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".gridscalr"))
        .filter_map(|entry| backup_entry(entry.path()))
        .collect();
    entries.sort_by(|left, right| right.file_name.cmp(&left.file_name));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "gridscalr-project-backup-test-{}-{counter}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn file(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn names(directory: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(directory)
            .expect("read directory")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();
        names.sort();
        names
    }

    #[test]
    fn rotation_keeps_only_the_newest_backups() {
        let temp = TestDir::new();
        for index in 1..=5 {
            fs::write(temp.file(&backup_name_at(index)), b"backup").expect("write backup");
        }
        rotate_backups(&temp.0, 3).expect("rotate");
        assert_eq!(
            names(&temp.0),
            vec![backup_name_at(3), backup_name_at(4), backup_name_at(5)]
        );
    }

    #[test]
    fn backup_names_avoid_unsafe_project_ids() {
        assert_eq!(safe_project_id("prj_demo-takeoff"), "prj_demo-takeoff");
        assert_eq!(safe_project_id("../evil/id"), "___evil_id");
        assert_eq!(safe_project_id(""), "unknown");
    }

    #[test]
    fn lists_backup_metadata_from_a_file() {
        let temp = TestDir::new();
        let target = temp.file(&backup_name_at(42));
        fs::write(&target, b"snapshot").expect("write backup");
        let entry = backup_entry(target).expect("backup entry");
        assert_eq!(entry.file_name, backup_name_at(42));
        assert_eq!(entry.size_bytes, 8);
        assert!(!entry.path.is_empty());
    }
}
