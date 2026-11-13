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

    /// A trash stand-in that moves the file into a folder outside the project,
    /// the way the operating system trash removes it from its old place.
    fn trash(&self) -> (std::path::PathBuf, impl Fn(&Path) -> bool) {
        let folder = self.root.join("Trash");
        fs::create_dir_all(&folder).expect("create trash folder");
        let destination = folder.clone();
        let moves = move |path: &Path| {
            let name = match path.file_name() {
                Some(name) => name.to_owned(),
                None => return false,
            };
            fs::rename(path, destination.join(name)).is_ok()
        };
        (folder, moves)
    }

    fn removed_folders(&self) -> Vec<std::path::PathBuf> {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return Vec::new();
        };
        entries
            .flatten()
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .to_string()
                    .ends_with(".removed")
            })
            .map(|entry| entry.path())
            .collect()
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn names(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
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
fn moves_one_listed_copy_to_the_trash_and_leaves_the_project_untouched() {
    let dir = TestDir::new();
    let source = dir.root.join("Shared/Original.pdf");
    fs::create_dir_all(source.parent().unwrap()).expect("create shared");
    fs::write(&source, b"%PDF-1.4 original").expect("write source");
    let copy = dir.file("Original-aaaaaaaa.pdf", b"%PDF-1.4 original");
    let (trash, moves) = dir.trash();

    let report =
        remove_managed_copies_with(&dir.project, &names(&["Original-aaaaaaaa.pdf"]), moves)
            .expect("remove");

    assert_eq!(
        report.removed,
        vec![RemovedManagedCopy {
            file_name: "Original-aaaaaaaa.pdf".to_string(),
            destination: RemovalDestination::Trash,
        }]
    );
    assert!(report.skipped.is_empty());
    assert!(report.failed.is_empty());
    assert_eq!(report.folder, None, "a trash move needs no fallback folder");
    assert!(!copy.exists());
    assert!(trash.join("Original-aaaaaaaa.pdf").exists());
    assert!(dir.removed_folders().is_empty());
    assert!(dir.project.exists());
    assert_eq!(
        fs::read(&source).expect("read source"),
        b"%PDF-1.4 original"
    );
}

#[test]
fn an_unavailable_trash_moves_the_copy_into_a_reported_folder() {
    let dir = TestDir::new();
    let copy = dir.file("Original-aaaaaaaa.pdf", b"%PDF-1.4 original");

    let report =
        remove_managed_copies_with(&dir.project, &names(&["Original-aaaaaaaa.pdf"]), |_| false)
            .expect("remove");

    assert_eq!(report.removed.len(), 1);
    assert_eq!(report.removed[0].destination, RemovalDestination::Folder);
    let folder = report.folder.expect("the fallback folder is reported");
    let folder = Path::new(&folder);
    assert!(folder.starts_with(&dir.root));
    assert!(folder
        .file_name()
        .expect("folder name")
        .to_string_lossy()
        .ends_with(".removed"));
    assert!(!copy.exists(), "the copy left the drawings folder");
    assert_eq!(
        fs::read(folder.join("Original-aaaaaaaa.pdf")).expect("read moved copy"),
        b"%PDF-1.4 original"
    );
    assert!(dir.project.exists());
}

#[test]
fn one_fallback_folder_is_shared_by_the_whole_batch() {
    let dir = TestDir::new();
    dir.file("First-aaaaaaaa.pdf", b"one");
    dir.file("Second-bbbbbbbb.pdf", b"two");

    let report = remove_managed_copies_with(
        &dir.project,
        &names(&["First-aaaaaaaa.pdf", "Second-bbbbbbbb.pdf"]),
        |_| false,
    )
    .expect("remove");

    assert_eq!(report.removed.len(), 2);
    let folder = report.folder.expect("folder");
    assert_eq!(dir.removed_folders().len(), 1, "one folder per request");
    assert!(Path::new(&folder).join("First-aaaaaaaa.pdf").exists());
    assert!(Path::new(&folder).join("Second-bbbbbbbb.pdf").exists());
}

#[test]
fn skips_a_name_that_is_no_longer_listed() {
    let dir = TestDir::new();
    let kept = dir.file("Kept-aaaaaaaa.pdf", b"%PDF-1.4");
    dir.file("Gone-bbbbbbbb.pdf", b"%PDF-1.4");
    fs::remove_file(dir.drawings().join("Gone-bbbbbbbb.pdf")).expect("remove fixture");

    let report = remove_managed_copies_with(
        &dir.project,
        &names(&["Gone-bbbbbbbb.pdf", "Kept-aaaaaaaa.pdf"]),
        |_| false,
    )
    .expect("remove");

    assert_eq!(report.skipped, names(&["Gone-bbbbbbbb.pdf"]));
    assert_eq!(report.removed.len(), 1);
    assert!(!kept.exists());
}

#[test]
fn refuses_an_unsafe_name_before_moving_anything() {
    let dir = TestDir::new();
    let plan = dir.file("Plan-aaaaaaaa.pdf", b"%PDF-1.4");
    dir.file("Notes.txt", b"not a drawing");

    for name in ["../Level 01.gridscalr", "Notes.txt", ""] {
        let error =
            remove_managed_copies_with(&dir.project, &names(&[name, "Plan-aaaaaaaa.pdf"]), |_| {
                false
            })
            .expect_err("must refuse the whole request");
        assert_eq!(error.code, "unsafePath", "{name}");
        assert!(plan.exists(), "a refused request moves nothing: {name}");
    }
}

#[test]
fn removes_a_duplicate_name_only_once() {
    let dir = TestDir::new();
    dir.file("Plan-aaaaaaaa.pdf", b"%PDF-1.4");
    let (trash, moves) = dir.trash();

    let report = remove_managed_copies_with(
        &dir.project,
        &names(&["Plan-aaaaaaaa.pdf", "Plan-aaaaaaaa.pdf"]),
        moves,
    )
    .expect("remove");

    assert_eq!(report.removed.len(), 1);
    assert!(trash.join("Plan-aaaaaaaa.pdf").exists());
}

#[cfg(unix)]
#[test]
fn never_lists_or_moves_a_symbolic_link() {
    use std::os::unix::fs::symlink;

    let dir = TestDir::new();
    let outside = dir.root.join("Outside.pdf");
    fs::write(&outside, b"%PDF-1.4 outside").expect("write outside");
    fs::create_dir_all(dir.drawings()).expect("create drawings");
    symlink(&outside, dir.drawings().join("Linked-aaaaaaaa.pdf")).expect("create symlink");

    assert!(list_managed_copies_in(&dir.project)
        .expect("list")
        .is_empty());
    let report =
        remove_managed_copies_with(&dir.project, &names(&["Linked-aaaaaaaa.pdf"]), |_| false)
            .expect("remove");
    assert_eq!(report.skipped, names(&["Linked-aaaaaaaa.pdf"]));
    assert!(report.removed.is_empty());
    assert_eq!(
        fs::read(&outside).expect("read outside"),
        b"%PDF-1.4 outside"
    );
}
