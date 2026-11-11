use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "gridscalr-project-backup-test-{}-{counter}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create test directory");
        Self(path)
    }

    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
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

#[test]
fn rotation_keeps_only_the_newest_backups() {
    let temp = TestDir::new();
    for index in 1..=5 {
        fs::write(temp.file(&backup_name_at(index)), b"backup").expect("write backup");
    }
    rotate_backups(&temp.0, 3).expect("rotate");
    assert_eq!(
        names(&temp.0),
        vec![backup_name_at(3), backup_name_at(4), backup_name_at(5)]
    );
}

#[test]
fn backup_names_avoid_unsafe_project_ids() {
    assert_eq!(safe_project_id("prj_demo-takeoff"), "prj_demo-takeoff");
    assert_eq!(safe_project_id("../evil/id"), "___evil_id");
    assert_eq!(safe_project_id(""), "unknown");
}

#[test]
fn lists_backup_metadata_from_a_file() {
    let temp = TestDir::new();
    let target = temp.file(&backup_name_at(42));
    fs::write(&target, b"snapshot").expect("write backup");
    let entry = backup_entry(target, Some("/work/Plan.gridscalr".into())).expect("backup entry");
    assert_eq!(entry.file_name, backup_name_at(42));
    assert_eq!(entry.size_bytes, 8);
    assert_eq!(entry.project_path.as_deref(), Some("/work/Plan.gridscalr"));
    assert!(!entry.path.is_empty());
}

#[test]
fn save_applies_retention_and_records_the_origin_path() {
    let temp = TestDir::new();
    for _ in 0..5 {
        save_backup_in(&temp.0, "project", 3, Some("/work/Plan.gridscalr".into()))
            .expect("save backup");
    }
    let entries = list_backups_in(&temp.0).expect("list backups");
    assert_eq!(entries.len(), 3);
    assert!(entries[0].file_name > entries[1].file_name);
    assert!(entries[1].file_name > entries[2].file_name);
    for entry in &entries {
        assert_eq!(entry.project_path.as_deref(), Some("/work/Plan.gridscalr"));
    }
}

#[test]
fn retention_is_clamped_to_the_supported_range() {
    assert_eq!(clamp_retention(0), MIN_BACKUP_RETENTION);
    assert_eq!(clamp_retention(1), MIN_BACKUP_RETENTION);
    assert_eq!(clamp_retention(3), 3);
    assert_eq!(clamp_retention(99), MAX_BACKUP_RETENTION);

    let temp = TestDir::new();
    for _ in 0..4 {
        save_backup_in(&temp.0, "project", 0, None).expect("save backup");
    }
    assert_eq!(
        list_backups_in(&temp.0).expect("list").len(),
        MIN_BACKUP_RETENTION
    );

    let wide = TestDir::new();
    for _ in 0..(MAX_BACKUP_RETENTION + 2) {
        save_backup_in(&wide.0, "project", 99, None).expect("save backup");
    }
    assert_eq!(
        list_backups_in(&wide.0).expect("list").len(),
        MAX_BACKUP_RETENTION
    );
}

#[test]
fn deletes_one_backup_without_touching_the_others() {
    let temp = TestDir::new();
    for _ in 0..3 {
        save_backup_in(&temp.0, "project", 3, None).expect("save backup");
    }
    let before = list_backups_in(&temp.0).expect("list");
    let victim = before[1].file_name.clone();
    delete_backup_in(&temp.0, &victim).expect("delete backup");
    let after = list_backups_in(&temp.0).expect("list");
    assert_eq!(after.len(), 2);
    assert!(after.iter().all(|entry| entry.file_name != victim));
    assert!(!temp.file(&victim).exists());
}

#[test]
fn rejects_a_backup_name_outside_the_project_folder() {
    let temp = TestDir::new();
    let source = temp.file("Plan.pdf");
    fs::write(&source, b"source drawing").expect("write source");
    for name in [
        "../Plan.pdf",
        "C:\\Plan.pdf",
        "manifest.json",
        "backup-x.txt",
    ] {
        let error = delete_backup_in(&temp.0, name).expect_err("reject name");
        assert_eq!(error.code, "backupDeleteInvalid");
    }
    assert_eq!(fs::read(&source).expect("read source"), b"source drawing");
}

#[test]
fn deleting_all_removes_the_whole_set() {
    let temp = TestDir::new();
    let directory = temp.file("backups").join("prj_1");
    fs::create_dir_all(&directory).expect("create folder");
    for _ in 0..3 {
        save_backup_in(&directory, "project", 3, None).expect("save backup");
    }
    delete_all_in(&directory).expect("delete all");
    assert!(!directory.exists());
    assert!(list_backups_in(&directory).is_err());
}

#[test]
fn backup_commands_never_write_the_source_drawing() {
    let temp = TestDir::new();
    let source = temp.file("Plan.pdf");
    fs::write(&source, b"%PDF-1.7 source drawing").expect("write source");
    let before_bytes = fs::read(&source).expect("read source");
    let before_modified = fs::metadata(&source)
        .expect("source metadata")
        .modified()
        .expect("modified time");

    let directory = temp.file("backups").join("prj_1");
    fs::create_dir_all(&directory).expect("create folder");
    let first = save_backup_in(
        &directory,
        "project one",
        2,
        Some("/work/Plan.gridscalr".into()),
    )
    .expect("save backup");
    save_backup_in(&directory, "project two", 2, None).expect("save backup");
    list_backups_in(&directory).expect("list backups");
    delete_backup_in(&directory, &first.file_name).expect("delete backup");
    delete_all_in(&directory).expect("delete all");

    assert_eq!(fs::read(&source).expect("read source"), before_bytes);
    assert_eq!(
        fs::metadata(&source)
            .expect("source metadata")
            .modified()
            .expect("modified time"),
        before_modified
    );
}
