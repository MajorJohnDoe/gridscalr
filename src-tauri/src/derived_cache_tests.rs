use super::*;
use crate::commands::CommandError;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDir {
    root: std::path::PathBuf,
    project: std::path::PathBuf,
}

impl TestDir {
    fn new() -> Self {
        let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "gridscalr-derived-cache-test-{}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let project = root.join("Level 01.gridscalr");
        fs::write(&project, b"{}").expect("write project");
        Self { root, project }
    }

    fn file(&self, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = self.root.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(&path, bytes).expect("write fixture");
        path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

const SHA: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PDF: &[u8] = b"%PDF-1.7 derived scan";

fn request(dir: &TestDir, data: &[u8]) -> DerivedCacheRequest {
    DerivedCacheRequest {
        project_path: dir.project.to_string_lossy().to_string(),
        source_sha256: SHA.to_string(),
        converter_version: 1,
        page_count: 3,
        data_base64: base64::engine::general_purpose::STANDARD.encode(data),
        protected_paths: Vec::new(),
    }
}

#[test]
fn writes_the_cache_beside_the_project_and_verifies_it() {
    let dir = TestDir::new();
    let info = write_derived_cache(&request(&dir, PDF)).expect("write cache");
    assert_eq!(
        info.relative_path,
        "Level 01.derived/0123456789abcdef-v1-p3.pdf"
    );
    assert_eq!(info.size_bytes, PDF.len() as u64);
    assert_eq!(fs::read(&info.destination_path).expect("read cache"), PDF);
    assert_eq!(info.sha256, hash_bytes(PDF));
    assert_eq!(info.sha256.len(), 64);
}

#[test]
fn the_file_name_is_the_cache_key() {
    assert_eq!(
        cache_file_name(SHA, 1, 3),
        "0123456789abcdef-v1-p3.pdf".to_string()
    );
    // A different converter version or page count is a different file, so a
    // rebuild never overwrites a cache another marker still names.
    assert_ne!(cache_file_name(SHA, 2, 3), cache_file_name(SHA, 1, 3));
    assert_ne!(cache_file_name(SHA, 1, 4), cache_file_name(SHA, 1, 3));
}

#[test]
fn reuses_an_identical_cache_and_replaces_a_corrupt_one() {
    let dir = TestDir::new();
    let first = write_derived_cache(&request(&dir, PDF)).expect("first write");
    let second = write_derived_cache(&request(&dir, PDF)).expect("second write");
    assert_eq!(first.destination_path, second.destination_path);

    fs::write(&first.destination_path, b"%PDF-1.7 old bytes").expect("corrupt cache");
    let repaired = write_derived_cache(&request(&dir, PDF)).expect("repair");
    assert_eq!(fs::read(&repaired.destination_path).expect("read"), PDF);
}

#[test]
fn refuses_a_payload_that_is_not_a_pdf() {
    let dir = TestDir::new();
    let error = write_derived_cache(&request(&dir, b"not a pdf")).expect_err("must refuse");
    assert_eq!(error.code, "invalidPayload");
    assert!(!dir.root.join("Level 01.derived").exists());
}

#[test]
fn refuses_an_invalid_key_before_writing_anything() {
    let dir = TestDir::new();
    let mut bad_hash = request(&dir, PDF);
    bad_hash.source_sha256 = "abc".to_string();
    assert_eq!(
        write_derived_cache(&bad_hash).expect_err("bad hash").code,
        "invalidPayload"
    );

    let mut bad_version = request(&dir, PDF);
    bad_version.converter_version = 0;
    assert_eq!(
        write_derived_cache(&bad_version)
            .expect_err("bad version")
            .code,
        "invalidPayload"
    );

    let mut bad_pages = request(&dir, PDF);
    bad_pages.page_count = 0;
    assert_eq!(
        write_derived_cache(&bad_pages).expect_err("bad pages").code,
        "invalidPayload"
    );
    assert!(!dir.root.join("Level 01.derived").exists());
}

#[test]
fn never_writes_over_a_protected_scan() {
    let dir = TestDir::new();
    let source = dir.file("Scans/Plan.tif", b"II*\0 tif bytes");
    let mut cache = request(&dir, PDF);
    // A protected path that happens to hold the whole project folder is not a
    // source file and must not block the cache; a source file must.
    cache.protected_paths = vec![source.to_string_lossy().to_string()];
    let info = write_derived_cache(&cache).expect("a TIF source does not collide");
    assert!(info.destination_path.ends_with(".pdf"));
    assert_eq!(
        fs::read(&source).expect("read scan"),
        b"II*\0 tif bytes",
        "the source scan is never written"
    );

    cache.protected_paths = vec![info.destination_path.clone()];
    let error = write_derived_cache(&cache).expect_err("the cache path is protected");
    assert_eq!(error.code, "sourceOverwrite");
}

#[test]
fn refuses_a_protected_folder_that_contains_the_cache_endpoint() {
    let dir = TestDir::new();
    let mut cache = request(&dir, PDF);
    cache.protected_paths = vec![dir.project.to_string_lossy().to_string()];
    // The project file itself is a protected file, not a folder, so the cache
    // is still allowed to live in its own sibling folder.
    write_derived_cache(&cache).expect("the project file is not the cache folder");

    let folder = dir.root.join("Level 01.derived");
    cache.protected_paths = vec![folder.to_string_lossy().to_string()];
    let error: CommandError = write_derived_cache(&cache).expect_err("protected folder");
    assert_eq!(error.code, "sourceOverwrite");
}

#[cfg(unix)]
#[test]
fn refuses_a_cache_folder_that_escapes_the_project_through_a_symlink() {
    use std::os::unix::fs::symlink;

    let dir = TestDir::new();
    let outside = TestDir::new();
    symlink(&outside.root, dir.root.join("Level 01.derived")).expect("create symlink");
    let error = write_derived_cache(&request(&dir, PDF)).expect_err("must refuse");
    assert_eq!(error.code, "unsafePath");
    assert_eq!(
        fs::read_dir(&outside.root).expect("read outside").count(),
        1,
        "nothing is written into the symlinked folder (only its project file exists)"
    );
}

#[test]
fn a_project_without_a_folder_is_refused() {
    let dir = TestDir::new();
    let mut cache = request(&dir, PDF);
    cache.project_path = "Level 01.gridscalr".to_string();
    let error = write_derived_cache(&cache).expect_err("no folder");
    assert_eq!(error.code, "invalidPayload");
}
