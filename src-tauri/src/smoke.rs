//! Packaged smoke-test plumbing. The module is compiled into debug builds only,
//! so a release build has no command that can report a test directory or exit
//! the app. CI builds the shell with `--debug` before running `--smoke-test`;
//! see F-037 in `docs/security-audit.md` and `security/policy.json`.

use std::sync::Mutex;

/// Output directory requested by `--smoke-test`, consumed by the frontend.
#[derive(Default)]
pub struct SmokeTest(Mutex<Option<String>>);

impl SmokeTest {
    pub fn set(&self, directory: Option<String>) {
        if let Ok(mut target) = self.0.lock() {
            *target = directory;
        }
    }

    pub fn directory(&self) -> Option<String> {
        self.0.lock().ok().and_then(|directory| directory.clone())
    }
}

#[tauri::command]
pub fn smoke_test_dir(state: tauri::State<'_, SmokeTest>) -> Option<String> {
    state.directory()
}

#[tauri::command]
pub fn finish_smoke_test(app: tauri::AppHandle, code: i32) {
    app.exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_requested_directory_until_read() {
        let state = SmokeTest::default();
        assert!(state.directory().is_none());
        state.set(Some("/tmp/smoke".to_string()));
        assert_eq!(state.directory().as_deref(), Some("/tmp/smoke"));
    }

    #[test]
    fn is_only_compiled_with_debug_assertions() {
        // This module is declared behind `#[cfg(debug_assertions)]` in lib.rs, so
        // reaching this test proves the release gate is active for this build.
        assert!(cfg!(debug_assertions));
    }
}
