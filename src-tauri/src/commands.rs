use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use base64::Engine;
use serde::Serialize;
use tauri::ipc::Response;

use crate::path_guard::{
    clean_stale_temporaries, ensure_writable, read_limited, read_text_limited, MAX_PROJECT_BYTES,
    MAX_SOURCE_BYTES,
};

/// A user-facing command failure. The frontend maps `code` to a catalog message
/// and shows `detail` as a separate technical line.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub detail: String,
}

impl CommandError {
    pub(crate) fn new(code: &'static str, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
}

static FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Flushes a finished temporary file and then swaps it into place. The previous
/// file is never deleted: the replacement is a single rename, so a failure or a
/// crash leaves either the old file or the new one at the destination.
fn atomic_write(path: &Path, data: &[u8]) -> Result<(), CommandError> {
    let file_name = path
        .file_name()
        .ok_or_else(|| CommandError::new("notAFile", ""))?;
    let display_name = file_name.to_string_lossy().to_string();
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    fs::create_dir_all(&parent).map_err(|error| {
        CommandError::new("createFolderFailed", format!("{display_name}: {error}"))
    })?;
    // A crashed earlier save may have left a flushed temporary sibling behind.
    // Cleaning it here keeps project data out of the folder without ever
    // touching a file a live writer may still own (F-041).
    clean_stale_temporaries(path);

    let temp = unique_sibling(path, "tmp");
    if let Err(error) = write_flushed(&temp, data) {
        let _ = fs::remove_file(&temp);
        return Err(CommandError::new(
            "writeFailed",
            format!("{display_name}: {error}"),
        ));
    }

    replace_file(&temp, path, &display_name)
}

/// Moves a finished, flushed temporary file over its destination. The previous
/// file is only ever replaced by this single rename.
pub(crate) fn replace_file(
    temp: &Path,
    path: &Path,
    display_name: &str,
) -> Result<(), CommandError> {
    match fs::rename(temp, path) {
        Ok(()) => {
            sync_directory(path.parent().unwrap_or_else(|| Path::new(".")));
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(temp);
            Err(CommandError::new(
                "replaceFailed",
                format!("{display_name}: {error}"),
            ))
        }
    }
}

pub(crate) fn write_flushed(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(data)?;
    file.sync_all()?;
    Ok(())
}

#[cfg(unix)]
pub(crate) fn sync_directory(directory: &Path) {
    // Persist the rename itself, not only the file contents.
    if let Ok(handle) = File::open(directory) {
        let _ = handle.sync_all();
    }
}

#[cfg(not(unix))]
pub(crate) fn sync_directory(_directory: &Path) {}

pub(crate) fn unique_sibling(path: &Path, suffix: &str) -> PathBuf {
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "gridscalr".to_string());
    let counter = FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    parent.join(format!(
        ".{name}.{}.{stamp}.{counter}.{suffix}",
        std::process::id()
    ))
}

#[tauri::command]
pub fn read_binary(path: String) -> Result<Response, CommandError> {
    let bytes = read_limited(Path::new(&path), MAX_SOURCE_BYTES)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn read_text(path: String) -> Result<String, CommandError> {
    read_text_limited(Path::new(&path), MAX_PROJECT_BYTES)
}

#[tauri::command]
pub fn write_text(
    path: String,
    contents: String,
    protected_paths: Vec<String>,
) -> Result<(), CommandError> {
    ensure_writable(&path, &protected_paths)?;
    atomic_write(Path::new(&path), contents.as_bytes())
}

#[tauri::command]
pub fn write_binary_base64(
    path: String,
    data: String,
    protected_paths: Vec<String>,
) -> Result<(), CommandError> {
    ensure_writable(&path, &protected_paths)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|error| CommandError::new("invalidPayload", error.to_string()))?;
    atomic_write(Path::new(&path), &bytes)
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Current byte length of an existing file, used to notice a source drawing
/// that changed while its project stayed open. Missing files return `None`.
#[tauri::command]
pub fn file_size(path: String) -> Option<u64> {
    std::fs::metadata(path).ok().map(|metadata| metadata.len())
}

/// Copies the bundled demo project and drawing into the app data folder so the
/// demo can be edited and saved without writing into the installation. An
/// existing copy is kept, so edits and a moved drawing survive later launches.
#[tauri::command]
pub fn prepare_demo_project(app: tauri::AppHandle) -> Result<String, CommandError> {
    use tauri::Manager;

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::new("appDataFolderFailed", error.to_string()))?
        .join("demo");
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| CommandError::new("demoResourceFailed", error.to_string()))?;
    copy_demo_assets(&resource_dir, &data_dir)
}

fn copy_demo_assets(resource_dir: &Path, data_dir: &Path) -> Result<String, CommandError> {
    fs::create_dir_all(data_dir)
        .map_err(|error| CommandError::new("demoFolderFailed", error.to_string()))?;
    for (name, resource) in [
        ("demo-project.gridscalr", "demo/demo-project.gridscalr"),
        ("industrial-plan.pdf", "demo/industrial-plan.pdf"),
    ] {
        let target = data_dir.join(name);
        if target.exists() {
            continue;
        }
        let source = resource_dir.join(resource);
        fs::copy(&source, &target)
            .map_err(|error| CommandError::new("demoCopyFailed", format!("{name}: {error}")))?;
    }
    Ok(data_dir
        .join("demo-project.gridscalr")
        .to_string_lossy()
        .into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path_guard::{comparison_key, resolved_path};

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let counter = FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "gridscalr-save-test-{}-{counter}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
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

    fn as_string(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }

    fn entries(directory: &Path) -> Vec<String> {
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
    fn reports_file_size_and_treats_missing_files_as_unknown() {
        let temp = TestDir::new();
        let drawing = temp.file("drawing.pdf");
        fs::write(&drawing, b"123456").expect("write drawing");
        assert_eq!(file_size(as_string(&drawing)), Some(6));
        assert_eq!(file_size(as_string(&temp.file("missing.pdf"))), None);
    }

    #[test]
    fn serializes_command_errors_for_the_frontend() {
        let error = CommandError::new("writeFailed", "plan.gridscalr: denied");
        let json = serde_json::to_value(&error).expect("serialize command error");
        assert_eq!(json["code"], "writeFailed");
        assert_eq!(json["detail"], "plan.gridscalr: denied");
    }

    #[test]
    fn blocks_a_protected_source_path() {
        let protected = vec!["C:\\Drawings\\Plan.pdf".to_string()];
        let error = ensure_writable("C:/Drawings/Plan.pdf", &protected).expect_err("protected");
        assert_eq!(error.code, "sourceOverwrite");
    }

    #[test]
    fn blocks_a_protected_source_path_regardless_of_case() {
        let protected = vec!["/home/ana/Plan.pdf".to_string()];
        let error = ensure_writable("/home/ana/plan.pdf", &protected).expect_err("protected");
        assert_eq!(error.code, "sourceOverwrite");
    }

    #[test]
    fn allows_a_different_export_path() {
        let protected = vec!["/home/ana/Plan.pdf".to_string()];
        assert!(ensure_writable("/home/ana/Plan-markups.pdf", &protected).is_ok());
    }

    #[test]
    fn empty_protected_paths_do_not_block() {
        assert!(ensure_writable("/home/ana/Plan.pdf", &[]).is_ok());
    }

    #[test]
    fn blocks_an_alternate_spelling_of_a_protected_source() {
        let directory = TestDir::new();
        let drawings = directory.file("drawings");
        fs::create_dir_all(&drawings).expect("create drawings");
        let source = drawings.join("Plan.pdf");
        fs::write(&source, b"source").expect("write source");
        let alternate = directory.file("other/../drawings/./Plan.pdf");
        assert!(ensure_writable(&as_string(&alternate), &[as_string(&source)]).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn blocks_a_symlink_to_a_protected_source() {
        use std::os::unix::fs::symlink;

        let directory = TestDir::new();
        let source = directory.file("Plan.pdf");
        fs::write(&source, b"source").expect("write source");
        let link = directory.file("copy.gridscalr");
        symlink(&source, &link).expect("create symlink");
        assert!(ensure_writable(&as_string(&link), &[as_string(&source)]).is_err());
    }

    #[test]
    fn blocks_a_hard_link_to_a_protected_source() {
        let directory = TestDir::new();
        let source = directory.file("Plan.pdf");
        fs::write(&source, b"source").expect("write source");
        let link = directory.file("hard-link.gridscalr");
        if fs::hard_link(&source, &link).is_err() {
            // Some file systems do not support hard links; the canonical check
            // still covers every other alternate spelling.
            return;
        }
        assert!(ensure_writable(&as_string(&link), &[as_string(&source)]).is_err());
    }

    #[test]
    fn writes_a_new_file_and_creates_missing_parents() {
        let directory = TestDir::new();
        let target = directory.file("nested/deeper/project.gridscalr");
        atomic_write(&target, b"new project").expect("write project");
        assert_eq!(fs::read(&target).expect("read project"), b"new project");
        assert_eq!(
            entries(&target.parent().expect("parent")),
            vec!["project.gridscalr".to_string()]
        );
    }

    #[test]
    fn replaces_an_existing_file_without_leaving_temporary_files() {
        let directory = TestDir::new();
        let target = directory.file("project.gridscalr");
        fs::write(&target, b"old project").expect("write old project");
        atomic_write(&target, b"new project").expect("replace project");
        assert_eq!(fs::read(&target).expect("read project"), b"new project");
        assert_eq!(
            entries(directory.path()),
            vec!["project.gridscalr".to_string()]
        );
    }

    #[test]
    fn keeps_the_previous_file_when_the_replacement_fails() {
        let directory = TestDir::new();
        let target = directory.file("project.gridscalr");
        fs::create_dir_all(&target).expect("create conflicting directory");
        fs::write(target.join("keep.txt"), b"keep").expect("write inner file");

        let error = atomic_write(&target, b"new project").expect_err("replacement must fail");

        assert_eq!(error.code, "replaceFailed", "{error:?}");
        assert!(!error.detail.is_empty(), "{error:?}");
        assert!(target.is_dir());
        assert_eq!(
            fs::read(target.join("keep.txt")).expect("keep inner file"),
            b"keep"
        );
        assert_eq!(
            entries(directory.path()),
            vec!["project.gridscalr".to_string()],
            "temporary files must be cleaned up"
        );
    }

    #[test]
    fn writes_a_large_payload_completely() {
        let directory = TestDir::new();
        let target = directory.file("large.gridscalr");
        let data: Vec<u8> = (0..8 * 1024 * 1024)
            .map(|index| (index % 251) as u8)
            .collect();
        atomic_write(&target, &data).expect("write large payload");
        assert_eq!(fs::read(&target).expect("read large payload"), data);
    }

    #[test]
    fn rejects_a_path_without_a_file_name() {
        let error = atomic_write(Path::new("/"), b"data").expect_err("directory target");
        assert_eq!(error.code, "notAFile");
    }

    #[test]
    fn resolves_the_real_target_behind_a_missing_file() {
        let directory = TestDir::new();
        let resolved = resolved_path(&directory.file("not-created.yet"));
        assert_eq!(
            comparison_key(&resolved),
            comparison_key(
                &fs::canonicalize(directory.path())
                    .expect("canonical dir")
                    .join("not-created.yet")
            )
        );
    }

    #[test]
    fn copies_demo_assets_once_and_keeps_edits() {
        let directory = TestDir::new();
        let resources = directory.file("resources");
        fs::create_dir_all(resources.join("demo")).expect("resource dir");
        fs::write(resources.join("demo/demo-project.gridscalr"), "{}").expect("project");
        fs::write(resources.join("demo/industrial-plan.pdf"), "pdf").expect("drawing");

        let data = directory.file("data/demo");
        let project = copy_demo_assets(&resources, &data).expect("first demo copy should succeed");
        assert!(project.ends_with("demo-project.gridscalr"));
        assert!(data.join("industrial-plan.pdf").exists());

        fs::write(&project, "edited").expect("edit demo");
        copy_demo_assets(&resources, &data).expect("second demo copy should succeed");
        assert_eq!(
            fs::read_to_string(&project).expect("read demo"),
            "edited",
            "an existing demo copy must not be overwritten"
        );
    }
}
