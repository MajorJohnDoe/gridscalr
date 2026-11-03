mod commands;
mod package;

use std::sync::Mutex;

use tauri::{Emitter, Manager};

/// Paths the operating system asked GridScalr to open, drained by the frontend.
///
/// Windows and Linux pass them as start arguments, macOS delivers them through
/// `RunEvent::Opened`, and a second launch forwards them from the single-instance
/// callback. Keeping one queue means every source behaves the same.
#[derive(Default)]
struct LaunchPaths(Mutex<Vec<String>>);

impl LaunchPaths {
    fn push<R: tauri::Runtime>(app: &tauri::AppHandle<R>, paths: Vec<String>) {
        if paths.is_empty() {
            return;
        }
        if let Ok(mut queued) = app.state::<Self>().0.lock() {
            queued.extend(paths);
        }
        let _ = app.emit("gridscalr:paths-queued", ());
    }
}

/// Start arguments without the executable and without flags such as `--flag`.
fn argument_paths(argv: &[String]) -> Vec<String> {
    argv.iter()
        .skip(1)
        .filter(|argument| !argument.starts_with('-'))
        .cloned()
        .collect()
}

fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// macOS delivers Finder double-clicks as file-open events rather than start
/// arguments, including for the already running instance.
#[cfg(target_os = "macos")]
fn handle_opened_files<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: tauri::RunEvent) {
    if let tauri::RunEvent::Opened { urls } = event {
        let paths = urls
            .into_iter()
            .filter_map(|url| url.to_file_path().ok())
            .map(|path| path.to_string_lossy().into_owned())
            .collect();
        LaunchPaths::push(app, paths);
    }
}

#[tauri::command]
fn take_launch_paths(state: tauri::State<'_, LaunchPaths>) -> Vec<String> {
    match state.0.lock() {
        Ok(mut queued) => std::mem::take(&mut *queued),
        Err(_) => Vec::new(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // The single-instance plugin must be registered first so a second launch is
    // caught before the app initialises a second window.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
                focus_main_window(app);
                LaunchPaths::push(app, argument_paths(&argv));
            }))
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::SIZE
                            | tauri_plugin_window_state::StateFlags::POSITION
                            | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                    )
                    .build(),
            );
    }

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .manage(LaunchPaths::default())
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
            take_launch_paths,
        ])
        .setup(|app| {
            let argv: Vec<String> = std::env::args().collect();
            LaunchPaths::push(app.handle(), argument_paths(&argv));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building GridScalr");

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        handle_opened_files(app, event);

        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app, event);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::argument_paths;

    #[test]
    fn keeps_file_arguments_and_drops_flags() {
        let argv = vec![
            "gridscalr".to_string(),
            "--flag".to_string(),
            "/tmp/plan.gridscalr".to_string(),
        ];
        assert_eq!(
            argument_paths(&argv),
            vec!["/tmp/plan.gridscalr".to_string()]
        );
    }

    #[test]
    fn ignores_a_bare_launch() {
        assert!(argument_paths(&["gridscalr".to_string()]).is_empty());
    }
}
