mod commands;
mod package;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_binary,
            commands::read_text,
            commands::write_text,
            commands::write_binary_base64,
            commands::path_exists,
            package::package_create,
            package::package_inspect,
            package::package_extract,
            package::package_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GridScalr");
}
