use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use tauri::ipc::Response;

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "The selected path has no parent directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("Could not create directory: {error}"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("gridscalr.tmp");
    let temp: PathBuf = parent.join(format!(".{file_name}.{}.tmp", std::process::id()));
    fs::write(&temp, data).map_err(|error| format!("Could not write file: {error}"))?;
    if fs::rename(&temp, path).is_err() {
        let _ = fs::remove_file(path);
        fs::rename(&temp, path).map_err(|error| {
            let _ = fs::remove_file(&temp);
            format!("Could not replace file: {error}")
        })?;
    }
    Ok(())
}

fn path_key(path: &str) -> String {
    let mut value = path.trim().replace('\\', "/");
    while value.ends_with('/') && value.len() > 1 {
        value.pop();
    }
    value.to_lowercase()
}

/// Second line of defence behind the frontend guard: a write must never target
/// one of the project's source drawings.
fn ensure_writable(path: &str, protected_paths: &[String]) -> Result<(), String> {
    let target = path_key(path);
    let blocked = protected_paths
        .iter()
        .filter(|protected| !protected.trim().is_empty())
        .any(|protected| path_key(protected) == target);
    if blocked {
        return Err(
            "Choose a different file name. GridScalr will not overwrite a source drawing."
                .to_string(),
        );
    }
    Ok(())
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
}
