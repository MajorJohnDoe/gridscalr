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
pub fn write_text(path: String, contents: String) -> Result<(), String> {
    atomic_write(Path::new(&path), contents.as_bytes())
}

#[tauri::command]
pub fn write_binary_base64(path: String, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|error| format!("Invalid binary payload: {error}"))?;
    atomic_write(Path::new(&path), &bytes)
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}
