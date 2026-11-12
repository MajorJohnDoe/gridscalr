use super::*;
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
            "gridscalr-source-cleanup-test-{}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create test directory");
        let project = root.join("Level 01.gridscalr");
        fs::write(&project, b"{}").expect("write project");
        Self { root, project }
    }

    fn drawings(&self) -> std::path::PathBuf {
        self.root.join("Level 01.drawings")
    }

    fn file(&self, name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = self.drawings().join(name);
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

#[test]
fn lists_only_regular_pdf_files_directly_in_the_drawings_folder() {
    let dir = TestDir::new();
    dir.file("Plan-aaaaaaaa.pdf", b"%PDF-1.4 one");
    dir.file("Notes.txt", b"not a drawing");
    dir.file("Nested/Hidden-bbbbbbbb.pdf", b"%PDF-1.4 nested");

    let entries = list_managed_copies_in(&dir.project).expect("list");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].file_name, "Plan-aaaaaaaa.pdf");
    assert_eq!(entries[0].size_bytes, 12);
    assert!(entries[0]
        .path
        .ends_with("Level 01.drawings/Plan-aaaaaaaa.pdf"));
}

#[test]
fn lists_nothing_when_the_folder_does_not_exist() {
    let dir = TestDir::new();
    assert!(list_managed_copies_in(&dir.project)
        .expect("missing folder is empty")
        .is_empty());
}

#[test]
fn deletes_one_listed_copy_and_leaves_the_project_untouched() {
    let dir = TestDir::new();
    let source = dir.root.join("Shared/Original.pdf");
    fs::create_dir_all(source.parent().unwrap()).expect("create shared");
    fs::write(&source, b"%PDF-1.4 original").expect("write source");
    let copy = dir.file("Original-aaaaaaaa.pdf", b"%PDF-1.4 original");

    delete_managed_copy_in(&dir.project, "Original-aaaaaaaa.pdf").expect("delete");
    assert!(!copy.exists());
    assert!(dir.project.exists());
    assert_eq!(
        fs::read(&source).expect("read source"),
        b"%PDF-1.4 original"
    );
}

#[test]
fn refuses_a_name_that_is_not_a_listed_pdf_leaf() {
    let dir = TestDir::new();
    dir.file("Plan-aaaaaaaa.pdf", b"%PDF-1.4");
    dir.file("Notes.txt", b"not a drawing");
    dir.file("Nested/Hidden-bbbbbbbb.pdf", b"%PDF-1.4 nested");

    for name in [
        "../Level 01.gridscalr",
        "Nested/Hidden-bbbbbbbb.pdf",
        "Notes.txt",
        "",
    ] {
        let error = delete_managed_copy_in(&dir.project, name).expect_err("must refuse");
        assert_eq!(error.code, "unsafePath", "{name}");
    }
    let error =
        delete_managed_copy_in(&dir.project, "Missing-cccccccc.pdf").expect_err("must refuse");
    assert_eq!(error.code, "readFailed");
    assert!(dir.drawings().join("Plan-aaaaaaaa.pdf").exists());
}

#[cfg(unix)]
#[test]
fn never_lists_or_deletes_a_symbolic_link() {
    use std::os::unix::fs::symlink;

    let dir = TestDir::new();
    let outside = dir.root.join("Outside.pdf");
    fs::write(&outside, b"%PDF-1.4 outside").expect("write outside");
    fs::create_dir_all(dir.drawings()).expect("create drawings");
    symlink(&outside, dir.drawings().join("Linked-aaaaaaaa.pdf")).expect("create symlink");

    assert!(list_managed_copies_in(&dir.project)
        .expect("list")
        .is_empty());
    let error =
        delete_managed_copy_in(&dir.project, "Linked-aaaaaaaa.pdf").expect_err("must refuse");
    assert_eq!(error.code, "readFailed");
    assert_eq!(
        fs::read(&outside).expect("read outside"),
        b"%PDF-1.4 outside"
    );
}
