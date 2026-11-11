use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "gridscalr-conflicted-copy-test-{}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create test directory");
        Self(path)
    }

    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn project(&self) -> PathBuf {
        let path = self.file("Plan.gridscalr");
        fs::write(&path, b"{\"project\":true}").expect("write project");
        path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn names(directory: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(directory)
        .expect("read directory")
        .map(|entry| {
            entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .to_string()
        })
        .collect();
    names.sort();
    names
}

const FIRST: &str = "Plan (conflicted copy 2026-11-11 1010).gridscalr";
const SECOND: &str = "Plan (conflicted copy 2026-11-11 1010 2).gridscalr";

#[test]
fn recognises_only_the_documented_names() {
    assert!(is_conflicted_copy_name(FIRST, "Plan"));
    assert!(is_conflicted_copy_name(SECOND, "Plan"));
    assert!(is_conflicted_copy_name(
        "Plan (conflicted copy 2026-11-11 1010 12).gridscalr",
        "Plan"
    ));
    // Look-alikes that must not match.
    assert!(!is_conflicted_copy_name("Plan.gridscalr", "Plan"));
    assert!(!is_conflicted_copy_name(
        "Plan (conflicted copy 2026-11-11).gridscalr",
        "Plan"
    ));
    assert!(!is_conflicted_copy_name(
        "Plan (conflicted copy 2026-11-11 1010).pdf",
        "Plan"
    ));
    assert!(!is_conflicted_copy_name(
        "Plan (conflicted copy 2026-11-11 1010) 2.gridscalr",
        "Plan"
    ));
    assert!(!is_conflicted_copy_name(
        "Plan (conflicted copy 2026-11-11 1010).gridscalr.tmp",
        "Plan"
    ));
    assert!(!is_conflicted_copy_name(
        "Plan (conflicted copy 2026-11-11 1010 0).gridscalr",
        "Plan"
    ));
    assert!(!is_conflicted_copy_name(
        "Other (conflicted copy 2026-11-11 1010).gridscalr",
        "Plan"
    ));
    assert!(is_conflicted_copy_name(
        "Plan.json (conflicted copy 2026-11-11 1010).gridscalr",
        "Plan.json"
    ));
    assert!(!is_conflicted_copy_name(
        "../Plan (conflicted copy 2026-11-11 1010).gridscalr",
        "Plan"
    ));
}

#[test]
fn derives_the_same_stem_as_the_save_flow() {
    assert_eq!(
        project_stem(Path::new("/work/Plan.gridscalr")),
        Some("Plan".into())
    );
    assert_eq!(
        project_stem(Path::new("/work/Plan.json")),
        Some("Plan.json".into())
    );
    assert_eq!(
        project_stem(Path::new("/work/.gridscalr")),
        Some("project".into())
    );
    assert_eq!(project_stem(Path::new("/")), None);
}

#[test]
fn lists_matching_siblings_with_size_and_time() {
    let temp = TestDir::new();
    let project = temp.project();
    fs::write(temp.file(FIRST), b"copy-one").expect("write copy");
    fs::write(temp.file(SECOND), b"copy-two-longer").expect("write copy");
    fs::write(temp.file("Plan notes.gridscalr"), b"lookalike").expect("write lookalike");
    fs::write(
        temp.file("Plan (conflicted copy 2026-11-11 1010).gridscalr.tmp"),
        b"temporary",
    )
    .expect("write temporary");

    let entries = list_conflicted_copies_in(&project).expect("list copies");
    let mut listed: Vec<&str> = entries
        .iter()
        .map(|entry| entry.file_name.as_str())
        .collect();
    listed.sort();
    assert_eq!(listed, vec![SECOND, FIRST]);
    let root = temp.0.to_string_lossy().to_string();
    assert!(entries.iter().all(|entry| entry.path.starts_with(&root)));
    let second = entries
        .iter()
        .find(|entry| entry.file_name == SECOND)
        .expect("second copy listed");
    assert_eq!(second.size_bytes, b"copy-two-longer".len() as u64);
    assert!(second.modified_at > 0);
}

#[test]
fn lists_an_empty_folder_and_ignores_a_missing_project_file() {
    let temp = TestDir::new();
    let project = temp.project();
    assert!(list_conflicted_copies_in(&project)
        .expect("list")
        .is_empty());
    // The original may be gone while its copies remain; discovery still works.
    fs::remove_file(&project).expect("remove project");
    fs::write(temp.file(FIRST), b"copy").expect("write copy");
    let entries = list_conflicted_copies_in(&project).expect("list copies");
    assert_eq!(entries.len(), 1);
}

#[test]
fn delete_removes_only_the_selected_copy() {
    let temp = TestDir::new();
    let project = temp.project();
    fs::write(temp.file(FIRST), b"copy-one").expect("write copy");
    fs::write(temp.file(SECOND), b"copy-two").expect("write copy");

    delete_conflicted_copy_in(&project, FIRST).expect("delete copy");
    assert_eq!(
        names(&temp.0),
        vec![SECOND.to_string(), "Plan.gridscalr".to_string()]
    );
    assert_eq!(
        fs::read(&project).expect("project intact"),
        b"{\"project\":true}"
    );
}

#[test]
fn delete_refuses_lookalikes_traversal_and_the_project_file() {
    let temp = TestDir::new();
    let project = temp.project();
    let lookalike = temp.file("Plan notes.gridscalr");
    fs::write(&lookalike, b"notes").expect("write lookalike");

    assert!(delete_conflicted_copy_in(&project, "Plan notes.gridscalr").is_err());
    assert!(delete_conflicted_copy_in(&project, "../Plan.gridscalr").is_err());
    assert!(delete_conflicted_copy_in(&project, "Plan.gridscalr").is_err());
    assert!(delete_conflicted_copy_in(&project, FIRST).is_err());
    assert!(lookalike.exists());
    assert!(project.exists());
}

#[cfg(unix)]
#[test]
fn ignores_a_symlink_out_of_the_folder() {
    let temp = TestDir::new();
    let outside = TestDir::new();
    let target = outside.file("Elsewhere.gridscalr");
    fs::write(&target, b"outside").expect("write outside file");
    let project = temp.project();
    std::os::unix::fs::symlink(&target, temp.file(FIRST)).expect("create symlink");

    assert!(list_conflicted_copies_in(&project)
        .expect("list")
        .is_empty());
    assert!(delete_conflicted_copy_in(&project, FIRST).is_err());
    assert!(target.exists());
}

#[cfg(unix)]
#[test]
fn rejects_traversal_to_a_copy_in_another_folder() {
    let temp = TestDir::new();
    let project = temp.project();
    let outside = TestDir::new();
    fs::write(outside.file(FIRST), b"elsewhere").expect("write outside copy");
    // A folder prefix in the requested name must never reach another folder.
    assert!(delete_conflicted_copy_in(&project, &format!("../{}", FIRST)).is_err());
    assert!(outside.file(FIRST).exists());
}
