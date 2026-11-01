use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use base64::Engine;
use tauri::ipc::Response;

const SOURCE_OVERWRITE_MESSAGE: &str =
    "Choose a different file name. GridScalr will not overwrite a source drawing.";

static FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Flushes a finished temporary file and then swaps it into place. The previous
/// file is never deleted: the replacement is a single rename, so a failure or a
/// crash leaves either the old file or the new one at the destination.
fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let file_name = path
        .file_name()
        .ok_or_else(|| "The selected path is not a file.".to_string())?;
    let display_name = file_name.to_string_lossy().to_string();
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    fs::create_dir_all(&parent).map_err(|error| {
        format!("Could not create the folder for {display_name}. Nothing was changed: {error}")
    })?;

    let temp = unique_sibling(path, "tmp");
    if let Err(error) = write_flushed(&temp, data) {
        let _ = fs::remove_file(&temp);
        return Err(format!(
            "Could not write {display_name}. The previous file was left unchanged: {error}"
        ));
    }

    match fs::rename(&temp, path) {
        Ok(()) => {
            sync_directory(&parent);
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(&temp);
            Err(format!(
                "Could not replace {display_name}. The previous file was left unchanged: {error}"
            ))
        }
    }
}

fn write_flushed(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(data)?;
    file.sync_all()?;
    Ok(())
}

#[cfg(unix)]
fn sync_directory(directory: &Path) {
    // Persist the rename itself, not only the file contents.
    if let Ok(handle) = File::open(directory) {
        let _ = handle.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_directory(_directory: &Path) {}

fn unique_sibling(path: &Path, suffix: &str) -> PathBuf {
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

/// The guard compares resolved targets, so a symlink, junction or an alternate
/// spelling such as `drawings/../drawings/plan.pdf` cannot reach a source file.
fn ensure_writable(path: &str, protected_paths: &[String]) -> Result<(), String> {
    let target = Path::new(path);
    let target_key = comparison_key(&resolved_path(target));
    let protected: Vec<&String> = protected_paths
        .iter()
        .filter(|protected| !protected.trim().is_empty())
        .collect();

    for source in &protected {
        let source_path = Path::new(source.as_str());
        if comparison_key(&resolved_path(source_path)) == target_key {
            return Err(SOURCE_OVERWRITE_MESSAGE.to_string());
        }
        // Canonical paths miss hard links, which are a second name for the same
        // file. Comparing file identities closes that gap when both exist.
        if target.exists() && same_file::is_same_file(target, source_path).unwrap_or(false) {
            return Err(SOURCE_OVERWRITE_MESSAGE.to_string());
        }
    }
    Ok(())
}

/// Resolves every existing part of the path, including symlinks and junctions,
/// and keeps the missing tail so a not-yet-created save target still compares
/// against its real parent folder.
fn resolved_path(path: &Path) -> PathBuf {
    if let Ok(resolved) = fs::canonicalize(path) {
        return resolved;
    }
    let mut existing = path.to_path_buf();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    loop {
        let Some(name) = existing.file_name() else {
            break;
        };
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
    lexical_path(path)
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

/// Case-insensitive key with forward slashes, matching the conservative
/// frontend guard. Windows canonical paths carry a `\\?\` verbatim prefix that
/// an unresolved protected path does not, so it is stripped before comparing.
fn comparison_key(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    let text = if let Some(rest) = text.strip_prefix("//?/UNC/") {
        format!("//{rest}")
    } else if let Some(rest) = text.strip_prefix("//?/") {
        rest.to_string()
    } else {
        text
    };
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

#[tauri::command]
pub fn read_binary(path: String) -> Result<Response, String> {
    let bytes = fs::read(&path).map_err(|error| format!("Could not read {path}: {error}"))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|error| format!("Could not read {path}: {error}"))
}

#[tauri::command]
pub fn write_text(
    path: String,
    contents: String,
    protected_paths: Vec<String>,
) -> Result<(), String> {
    ensure_writable(&path, &protected_paths)?;
    atomic_write(Path::new(&path), contents.as_bytes())
}

#[tauri::command]
pub fn write_binary_base64(
    path: String,
    data: String,
    protected_paths: Vec<String>,
) -> Result<(), String> {
    ensure_writable(&path, &protected_paths)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|error| format!("Invalid binary payload: {error}"))?;
    atomic_write(Path::new(&path), &bytes)
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn blocks_a_protected_source_path() {
        let protected = vec!["C:\\Drawings\\Plan.pdf".to_string()];
        assert!(ensure_writable("C:/Drawings/Plan.pdf", &protected).is_err());
    }

    #[test]
    fn blocks_a_protected_source_path_regardless_of_case() {
        let protected = vec!["/home/ana/Plan.pdf".to_string()];
        assert!(ensure_writable("/home/ana/plan.pdf", &protected).is_err());
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

        assert!(
            error.contains("previous file was left unchanged"),
            "{error}"
        );
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
        assert!(error.contains("not a file"), "{error}");
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
}
