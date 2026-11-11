mod commands;
mod disk_space;
mod package;
mod path_guard;
mod project_backup;
mod project_lease;
mod project_write;
#[cfg(debug_assertions)]
mod smoke;
mod source_copy;

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

/// Start arguments split into files to open and an optional smoke-test output
/// directory. `--smoke-test` consumes the next argument so the directory is
/// never mistaken for a project to open.
fn launch_arguments(argv: &[String]) -> (Vec<String>, Option<String>) {
    let mut paths = Vec::new();
    let mut smoke = None;
    let mut index = 1;
    while index < argv.len() {
        let argument = &argv[index];
        if argument == "--smoke-test" {
            smoke = argv.get(index + 1).cloned();
            index += 2;
            continue;
        }
        if !argument.starts_with('-') {
            paths.push(argument.clone());
        }
        index += 1;
    }
    (paths, smoke)
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
                LaunchPaths::push(app, launch_arguments(&argv).0);
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

    let app_builder = builder
        .plugin(tauri_plugin_dialog::init())
        .manage(LaunchPaths::default());

    // The smoke-test state and commands exist in debug builds only. Keeping the
    // gated entries out of a release handler means a renderer compromise cannot
    // exit the app through CI-only plumbing (F-037).
    #[cfg(debug_assertions)]
    let app_builder = app_builder.manage(smoke::SmokeTest::default());

    let app = app_builder
        .invoke_handler(tauri::generate_handler![
            commands::read_binary,
            commands::read_text,
            commands::write_text,
            commands::write_binary_base64,
            commands::path_exists,
            commands::file_size,
            commands::prepare_demo_project,
            project_write::project_file_stamp,
            project_write::project_file_metadata,
            project_write::write_project_conditional,
            project_lease::read_project_lease,
            project_lease::write_project_lease,
            project_lease::heartbeat_project_lease,
            project_lease::clear_project_lease,
            project_backup::save_project_backup,
            project_backup::list_project_backups,
            source_copy::source_copy_to_project,
            source_copy::source_file_hash,
            source_copy::source_find_by_hash,
            package::package_create,
            package::package_inspect,
            package::package_extract,
            package::package_cancel,
            take_launch_paths,
            #[cfg(debug_assertions)]
            smoke::smoke_test_dir,
            #[cfg(debug_assertions)]
            smoke::finish_smoke_test,
        ])
        .setup(|app| {
            let argv: Vec<String> = std::env::args().collect();
            let (paths, smoke) = launch_arguments(&argv);
            #[cfg(debug_assertions)]
            {
                if let Some(state) = app.try_state::<smoke::SmokeTest>() {
                    state.set(smoke);
                }
            }
            #[cfg(not(debug_assertions))]
            let _ = smoke;
            LaunchPaths::push(app.handle(), paths);
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
    use super::launch_arguments;

    #[test]
    fn keeps_file_arguments_and_drops_flags() {
        let argv = vec![
            "gridscalr".to_string(),
            "--flag".to_string(),
            "/tmp/plan.gridscalr".to_string(),
        ];
        assert_eq!(
            launch_arguments(&argv).0,
            vec!["/tmp/plan.gridscalr".to_string()]
        );
    }

    #[test]
    fn ignores_a_bare_launch() {
        let (paths, smoke) = launch_arguments(&["gridscalr".to_string()]);
        assert!(paths.is_empty());
        assert!(smoke.is_none());
    }

    #[test]
    fn reads_the_smoke_test_directory_without_treating_it_as_a_file() {
        let argv = vec![
            "gridscalr".to_string(),
            "--smoke-test".to_string(),
            "/tmp/smoke".to_string(),
            "/tmp/plan.gridscalr".to_string(),
        ];
        let (paths, smoke) = launch_arguments(&argv);
        assert_eq!(paths, vec!["/tmp/plan.gridscalr".to_string()]);
        assert_eq!(smoke.as_deref(), Some("/tmp/smoke"));
    }
}
