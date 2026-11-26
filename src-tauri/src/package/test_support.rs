//! Shared fixtures for the package tests.
//!
//! Test-only. Each module keeps its own `#[cfg(test)] mod tests` and imports
//! these helpers, so the fixtures live in one place without merging the tests
//! back into one file.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use super::create::create_package;
use super::error::PackageError;
use super::hash::hash_bytes;
use super::names::path_string;
use super::types::{CreateResult, PackageRequest, PackageSource};

static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

pub(crate) struct TestDir(PathBuf);

impl TestDir {
    pub(crate) fn new() -> Self {
        let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "gridscalr-package-test-{}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create test directory");
        Self(path)
    }

    pub(crate) fn path(&self) -> &Path {
        &self.0
    }

    pub(crate) fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(crate) fn write(path: &Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent");
    }
    fs::write(path, bytes).expect("write fixture");
}

pub(crate) fn sha(bytes: &[u8]) -> String {
    hash_bytes(bytes)
}

pub(crate) fn project_json(relative: &str, extra: &str) -> String {
    let separator = if extra.is_empty() { "" } else { "," };
    format!(
        r#"{{"schemaVersion":21,"name":"Plan","documents":[{{"id":"doc_1","kind":"pdf","name":"Plan.pdf","path":null,"relativePath":"{relative}","sha256":"","pageCount":1,"sizeBytes":1}}],"layers":[]{separator}{extra}}}"#
    )
}

pub(crate) fn request(
    output: &Path,
    project: &str,
    sources: Vec<(&Path, &str, &str)>,
) -> PackageRequest {
    let documents = sources
        .into_iter()
        .map(|(path, archive, expected)| PackageSource {
            source_path: path_string(path),
            archive_path: archive.to_string(),
            kind: "pdf".to_string(),
            expected_sha256: expected.to_string(),
        })
        .collect();
    PackageRequest {
        job_id: "test-job".to_string(),
        output_path: path_string(output),
        project_file_name: "Plan.gridscalr".to_string(),
        project_json: project.to_string(),
        project_schema: 21,
        app_version: "0.16.1".to_string(),
        created_at: "2026-11-01T10:00:00.000Z".to_string(),
        documents,
        exports: Vec::new(),
        source_scans: Vec::new(),
        derived_caches: Vec::new(),
        protected_paths: Vec::new(),
    }
}

pub(crate) fn create(request: &PackageRequest) -> Result<CreateResult, PackageError> {
    create_package(request, None, &AtomicBool::new(false))
}
