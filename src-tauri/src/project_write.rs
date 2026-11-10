use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::commands::{
    ensure_writable, replace_file, sync_directory, unique_sibling, write_flushed, CommandError,
};

/// The expected on-disk state of a project file. The hash is authoritative;
/// size and mtime let the UI describe the disk version without reading it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStamp {
    pub sha256: String,
    pub size_bytes: u64,
    pub modified_at: i64,
}

/// A save failure with enough information for the conflict dialog. `current`
/// is the disk stamp seen immediately before the rename, or `None` when the
/// target was missing. Backups reuse the same structured error shape.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteError {
    pub code: &'static str,
    pub detail: String,
    pub current: Option<FileStamp>,
}

impl WriteError {
    pub(crate) fn new(code: &'static str, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
            current: None,
        }
    }

    fn conflict(detail: impl Into<String>, current: Option<FileStamp>) -> Self {
        Self {
            code: "projectConflict",
            detail: detail.into(),
            current,
        }
    }
}

impl From<CommandError> for WriteError {
    fn from(error: CommandError) -> Self {
        Self {
            code: error.code,
            detail: error.detail,
            current: None,
        }
    }
}

fn hex_digest(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut text = String::with_capacity(digest.len() * 2);
    for byte in digest {
        text.push_str(&format!("{byte:02x}"));
    }
    text
}

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
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

pub(crate) fn modified_ms(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// Reads the current stamp of a file, or `None` when it does not exist.
fn stamp_of(path: &Path) -> std::io::Result<Option<FileStamp>> {
    match fs::metadata(path) {
        Ok(metadata) => {
            if !metadata.is_file() {
                return Ok(None);
            }
            Ok(Some(FileStamp {
                sha256: hash_file(path)?,
                size_bytes: metadata.len(),
                modified_at: modified_ms(&metadata),
            }))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn target_details(path: &Path) -> Result<(PathBuf, String), WriteError> {
    let file_name = path
        .file_name()
        .ok_or_else(|| WriteError::new("notAFile", ""))?;
    let display_name = file_name.to_string_lossy().to_string();
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    fs::create_dir_all(&parent).map_err(|error| {
        WriteError::new("createFolderFailed", format!("{display_name}: {error}"))
    })?;
    Ok((parent, display_name))
}

fn normalize_expected(expected: Option<&str>) -> Option<String> {
    expected
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
}

/// Writes a new project file only when the current disk hash still matches the
/// expected hash. The target is hashed again after the temporary file is
/// flushed and immediately before the single rename, so a change made while
/// the editor was open cannot be overwritten silently.
pub(crate) fn write_conditional(
    path: &Path,
    data: &[u8],
    expected_sha256: Option<&str>,
) -> Result<FileStamp, WriteError> {
    let (_parent, display_name) = target_details(path)?;
    let temp = unique_sibling(path, "tmp");
    if let Err(error) = write_flushed(&temp, data) {
        let _ = fs::remove_file(&temp);
        return Err(WriteError::new(
            "writeFailed",
            format!("{display_name}: {error}"),
        ));
    }

    let current = match stamp_of(path) {
        Ok(stamp) => stamp,
        Err(error) => {
            let _ = fs::remove_file(&temp);
            return Err(WriteError::new(
                "readFailed",
                format!("{display_name}: {error}"),
            ));
        }
    };

    if let Some(expected) = normalize_expected(expected_sha256) {
        let matches = current
            .as_ref()
            .map(|stamp| stamp.sha256 == expected)
            .unwrap_or(false);
        if !matches {
            let _ = fs::remove_file(&temp);
            return Err(WriteError::conflict(
                format!("{display_name}: the file changed on disk"),
                current,
            ));
        }
    }

    // Verify the flushed temporary file before replacing the readable project.
    match fs::read(&temp) {
        Ok(written) if hex_digest(&written) == hex_digest(data) => {}
        Ok(_) => {
            let _ = fs::remove_file(&temp);
            return Err(WriteError::new(
                "readBackMismatch",
                format!("{display_name}: temporary file verification failed"),
            ));
        }
        Err(error) => {
            let _ = fs::remove_file(&temp);
            return Err(WriteError::new(
                "writeFailed",
                format!("{display_name}: {error}"),
            ));
        }
    }

    replace_file(&temp, path, &display_name).map_err(WriteError::from)?;
    sync_directory(path.parent().unwrap_or_else(|| Path::new(".")));

    // Read the file back and verify the bytes and the stamp used by the next
    // conditional write. A mismatch is reported instead of a false success.
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) => {
            return Err(WriteError::new(
                "readBackMismatch",
                format!("{display_name}: {error}"),
            ));
        }
    };
    let readback = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            return Err(WriteError::new(
                "readBackMismatch",
                format!("{display_name}: {error}"),
            ));
        }
    };
    let sha256 = hex_digest(&readback);
    if sha256 != hex_digest(data) || readback.len() as u64 != metadata.len() {
        return Err(WriteError::new(
            "readBackMismatch",
            format!("{display_name}: the file did not read back as written"),
        ));
    }
    Ok(FileStamp {
        sha256,
        size_bytes: metadata.len(),
        modified_at: modified_ms(&metadata),
    })
}

#[tauri::command]
pub fn project_file_stamp(path: String) -> Result<Option<FileStamp>, WriteError> {
    stamp_of(Path::new(&path))
        .map_err(|error| WriteError::new("readFailed", format!("{path}: {error}")))
}

#[tauri::command]
pub fn write_project_conditional(
    path: String,
    contents: String,
    expected_sha256: Option<String>,
    protected_paths: Vec<String>,
) -> Result<FileStamp, WriteError> {
    ensure_writable(&path, &protected_paths).map_err(WriteError::from)?;
    write_conditional(
        Path::new(&path),
        contents.as_bytes(),
        expected_sha256.as_deref(),
    )
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
                "gridscalr-project-write-test-{}-{counter}",
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
    fn writes_a_new_file_and_returns_its_stamp() {
        let temp = TestDir::new();
        let target = temp.file("project.gridscalr");
        let stamp = write_conditional(&target, b"project", None).expect("write project");
        assert_eq!(stamp.size_bytes, 7);
        assert_eq!(stamp.sha256, hex_digest(b"project"));
        assert_eq!(
            fs::read_to_string(&target).expect("read project"),
            "project"
        );
        assert_eq!(names(&temp.0), vec!["project.gridscalr".to_string()]);
    }

    #[test]
    fn rejects_a_changed_file_and_keeps_the_previous_version() {
        let temp = TestDir::new();
        let target = temp.file("project.gridscalr");
        fs::write(&target, b"first version").expect("write first");
        let first = stamp_of(&target).expect("stamp first").expect("exists");

        fs::write(&target, b"second version").expect("write second");
        let error = write_conditional(&target, b"local version", Some(&first.sha256))
            .expect_err("changed file must conflict");

        assert_eq!(error.code, "projectConflict");
        let current = error.current.expect("conflict carries the disk stamp");
        assert_eq!(current.sha256, hex_digest(b"second version"));
        assert_eq!(
            fs::read_to_string(&target).expect("read previous"),
            "second version",
            "the disk version must stay readable and unchanged"
        );
        assert_eq!(names(&temp.0), vec!["project.gridscalr".to_string()]);
    }

    #[test]
    fn accepts_an_unchanged_file_and_replaces_it() {
        let temp = TestDir::new();
        let target = temp.file("project.gridscalr");
        fs::write(&target, b"first version").expect("write first");
        let first = stamp_of(&target).expect("stamp first").expect("exists");

        let stamp = write_conditional(&target, b"second version", Some(&first.sha256))
            .expect("conditional write");
        assert_eq!(stamp.sha256, hex_digest(b"second version"));
        assert_eq!(
            fs::read_to_string(&target).expect("read project"),
            "second version"
        );
    }

    #[test]
    fn treats_a_missing_target_as_a_conflict_for_an_expected_stamp() {
        let temp = TestDir::new();
        let target = temp.file("deleted.gridscalr");
        let error = write_conditional(&target, b"project", Some("abc"))
            .expect_err("missing target must conflict");
        assert_eq!(error.code, "projectConflict");
        assert!(error.current.is_none());
        assert!(!target.exists(), "a conflict must not recreate the file");
    }

    #[test]
    fn ignores_case_in_the_expected_hash() {
        let temp = TestDir::new();
        let target = temp.file("project.gridscalr");
        fs::write(&target, b"first version").expect("write first");
        let first = stamp_of(&target).expect("stamp first").expect("exists");
        write_conditional(
            &target,
            b"second version",
            Some(&first.sha256.to_uppercase()),
        )
        .expect("uppercase hash matches");
    }

    #[test]
    fn reports_a_missing_file_as_an_absent_stamp() {
        let temp = TestDir::new();
        assert!(stamp_of(&temp.file("missing.gridscalr"))
            .expect("stamp")
            .is_none());
    }
}
