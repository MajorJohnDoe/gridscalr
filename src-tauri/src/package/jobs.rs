//! Cancellation flags for the package jobs.
//!
//! A create or extract runs on a blocking worker. The command registers one flag
//! per job id, the worker polls it between chunks, and `package_cancel` flips it.
//! The registry removes the flag when the worker returns, so an id can be reused.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use super::error::PackageError;

static JOBS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn jobs() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn register_job(job_id: &str) -> Arc<AtomicBool> {
    let mut registry = jobs().lock().expect("package job registry poisoned");
    registry
        .entry(job_id.to_string())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .clone()
}

pub(crate) fn finish_job(job_id: &str) {
    if let Ok(mut registry) = jobs().lock() {
        registry.remove(job_id);
    }
}

pub(crate) fn check_cancelled(cancelled: &AtomicBool) -> Result<(), PackageError> {
    if cancelled.load(Ordering::SeqCst) {
        Err(PackageError::Cancelled)
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn package_cancel(job_id: String) {
    if let Ok(registry) = jobs().lock() {
        if let Some(flag) = registry.get(&job_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}
