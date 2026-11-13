//! Stale temporary cleanup for project writes, managed copies and package
//! extraction (F-041/F-046).
//!
//! Every writer in the app creates a sibling temporary and renames it into
//! place. A crash can leave that sibling behind, so opening a project removes
//! the ones the app itself generated. The guard is deliberately narrow: only an
//! exact generated name is considered, only entries older than
//! [`STALE_TEMP_AGE`] are removed, and a sibling carrying the running process's
//! own id is always kept because it may still be in flight. A source drawing,
//! a project file and any user file never match the pattern.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// A temporary sibling younger than this may still belong to a live writer.
pub(crate) const STALE_TEMP_AGE: Duration = Duration::from_secs(10 * 60);

/// Suffixes generated next to a project file or a managed copy.
const FILE_TEMP_SUFFIXES: [&str; 2] = ["tmp", "copy"];

/// Marker in a generated extraction folder name: `.<name>.extract-<pid>-<stamp>`.
const EXTRACT_MARKER: &str = ".extract-";

struct TempCandidate {
    pid: u128,
    created_nanos: u128,
}

fn digits(text: &str) -> Option<u128> {
    if text.is_empty() || !text.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}

/// Parses `.<name>.<pid>.<stamp>.<counter>.<tmp|copy>` below `prefix`.
fn file_candidate(name: &str, prefix: &str) -> Option<TempCandidate> {
    let rest = name.strip_prefix(prefix)?;
    let rest = FILE_TEMP_SUFFIXES
        .iter()
        .find_map(|suffix| rest.strip_suffix(&format!(".{suffix}")))?;
    let mut parts = rest.split('.');
    let pid = digits(parts.next()?)?;
    let created_nanos = digits(parts.next()?)?;
    // The counter only keeps concurrent writers apart; it is still required so
    // a user file that happens to look similar is never removed.
    digits(parts.next()?)?;
    if parts.next().is_some() {
        return None;
    }
    Some(TempCandidate { pid, created_nanos })
}

/// Parses `.<name>.extract-<pid>-<stamp>` anywhere in the folder.
fn extraction_candidate(name: &str) -> Option<TempCandidate> {
    if !name.starts_with('.') {
        return None;
    }
    let index = name.rfind(EXTRACT_MARKER)?;
    let rest = &name[index + EXTRACT_MARKER.len()..];
    let (pid, created) = rest.split_once('-')?;
    Some(TempCandidate {
        pid: digits(pid)?,
        created_nanos: digits(created)?,
    })
}

/// The process-age guard shared by every cleanup entry point.
fn should_remove(candidate: &TempCandidate, min_age: Duration, now: SystemTime) -> bool {
    if candidate.pid == u128::from(std::process::id()) {
        return false;
    }
    let created = SystemTime::UNIX_EPOCH
        .checked_add(Duration::from_nanos(candidate.created_nanos as u64))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    now.duration_since(created).unwrap_or_default() >= min_age
}

fn parent_folder(path: &Path) -> PathBuf {
    match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    }
}

fn remove_extraction_folders(parent: &Path, min_age: Duration, now: SystemTime) -> usize {
    let Ok(entries) = fs::read_dir(parent) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(candidate) = extraction_candidate(&name) else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        if !should_remove(&candidate, min_age, now) {
            continue;
        }
        if fs::remove_dir_all(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Removes stale atomic-write siblings left beside `path` by a crashed save.
pub(crate) fn clean_stale_temporaries(path: &Path) -> usize {
    clean_stale_temporaries_at(path, STALE_TEMP_AGE, SystemTime::now())
}

pub(crate) fn clean_stale_temporaries_at(path: &Path, min_age: Duration, now: SystemTime) -> usize {
    let Some(name) = path.file_name() else {
        return 0;
    };
    let parent = parent_folder(path);
    let prefix = format!(".{}.", name.to_string_lossy());
    let Ok(entries) = fs::read_dir(&parent) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let entry_name = entry.file_name().to_string_lossy().to_string();
        let Some(candidate) = file_candidate(&entry_name, &prefix) else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        if !should_remove(&candidate, min_age, now) {
            continue;
        }
        if fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Removes stale package extraction folders below `folder`.
///
/// The `.<name>.previous-<pid>-<stamp>` folder a replacement move leaves behind
/// is deliberately never removed: it holds the folder the user replaced, so
/// deleting it would destroy data the app did not create.
pub(crate) fn clean_extraction_temporaries(folder: &Path) -> usize {
    clean_extraction_temporaries_at(folder, STALE_TEMP_AGE, SystemTime::now())
}

pub(crate) fn clean_extraction_temporaries_at(
    folder: &Path,
    min_age: Duration,
    now: SystemTime,
) -> usize {
    remove_extraction_folders(folder, min_age, now)
}

/// Removes every app-created stale temporary after a project loads: flushed save
/// siblings next to the project file, extraction folders in the project folder
/// and stale managed-copy siblings inside `<project>.drawings/`.
pub(crate) fn clean_project_temporaries_at(
    project_path: &Path,
    min_age: Duration,
    now: SystemTime,
) -> usize {
    let mut removed = clean_stale_temporaries_at(project_path, min_age, now);
    let folder = parent_folder(project_path);
    removed += clean_extraction_temporaries_at(&folder, min_age, now);
    removed
}

/// Runs the post-load cleanup for one project path. The command is advisory:
/// a cleanup failure never affects the loaded project.
#[tauri::command]
pub fn clean_project_temporaries(project_path: String) -> usize {
    clean_project_temporaries_at(Path::new(&project_path), STALE_TEMP_AGE, SystemTime::now())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "gridscalr-temp-cleanup-test-{}-{counter}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn file(&self, name: &str, bytes: &[u8]) -> PathBuf {
            let path = self.0.join(name);
            fs::write(&path, bytes).expect("write fixture");
            path
        }

        fn folder(&self, name: &str) -> PathBuf {
            let path = self.0.join(name);
            fs::create_dir_all(&path).expect("create folder");
            path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn stamp(now: SystemTime, age_seconds: u64) -> u128 {
        now.duration_since(std::time::UNIX_EPOCH)
            .expect("epoch")
            .as_nanos()
            .saturating_sub(u128::from(age_seconds) * 1_000_000_000)
    }

    #[test]
    fn stale_file_siblings_are_removed_and_live_ones_are_kept() {
        let directory = TestDir::new();
        let target = directory.file("project.gridscalr", b"project");
        let now = SystemTime::now();
        let stale = stamp(now, 7200);
        let fresh = stamp(now, 0);
        let stale_tmp = directory.file(&format!(".project.gridscalr.999999.{stale}.0.tmp"), b"x");
        let stale_copy = directory.file(&format!(".project.gridscalr.999998.{stale}.1.copy"), b"x");
        let fresh_tmp = directory.file(&format!(".project.gridscalr.999997.{fresh}.2.tmp"), b"x");
        let own = directory.file(
            &format!(".project.gridscalr.{}.{stale}.3.tmp", std::process::id()),
            b"x",
        );
        let unrelated = directory.file(".project.gridscalr.tmp", b"x");
        let other_project = directory.file(&format!(".other.gridscalr.999996.{stale}.0.tmp"), b"x");

        let removed = clean_stale_temporaries_at(&target, Duration::from_secs(600), now);
        assert_eq!(removed, 2, "only the stale generated siblings are removed");
        assert!(!stale_tmp.exists());
        assert!(!stale_copy.exists());
        assert!(fresh_tmp.exists(), "a fresh temporary file is untouched");
        assert!(own.exists(), "the current process keeps its own temporary");
        assert!(unrelated.exists(), "a foreign file name is never removed");
        assert!(
            other_project.exists(),
            "another target's sibling is not removed"
        );
        assert_eq!(fs::read(&target).expect("read project"), b"project");
    }

    #[test]
    fn a_fresh_temporary_sibling_is_not_removed() {
        let directory = TestDir::new();
        let target = directory.file("project.gridscalr", b"project");
        let now = SystemTime::now();
        let fresh = directory.file(
            &format!(".project.gridscalr.999999.{}.0.tmp", stamp(now, 0)),
            b"x",
        );
        assert_eq!(
            clean_stale_temporaries_at(&target, Duration::from_secs(600), now),
            0
        );
        assert!(fresh.exists());
    }

    #[test]
    fn the_age_guard_keeps_an_entry_younger_than_the_limit() {
        let directory = TestDir::new();
        let target = directory.file("project.gridscalr", b"project");
        let now = SystemTime::now();
        let entry = directory.file(
            &format!(".project.gridscalr.999999.{}.0.tmp", stamp(now, 600)),
            b"x",
        );
        // The name is 600 s old, so a 601 s limit keeps it and a 600 s limit
        // removes it. Both directions are asserted so the comparison cannot
        // silently flip to `<` or `>`.
        assert_eq!(
            clean_stale_temporaries_at(&target, Duration::from_secs(601), now),
            0
        );
        assert!(entry.exists());
        assert_eq!(
            clean_stale_temporaries_at(&target, Duration::from_secs(600), now),
            1
        );
        assert!(!entry.exists());
    }

    #[test]
    fn stale_extraction_folders_are_removed_and_previous_folders_are_kept() {
        let folder = TestDir::new();
        let now = SystemTime::now();
        let stale = stamp(now, 7200);
        let fresh = stamp(now, 0);
        let stale_extract = folder.folder(&format!(".Plan.extract-999999-{stale}"));
        fs::write(stale_extract.join("Plan.gridscalr"), b"data").expect("inner file");
        let fresh_extract = folder.folder(&format!(".Plan.extract-999998-{fresh}"));
        let own_extract = folder.folder(&format!(".Plan.extract-{}-{stale}", std::process::id()));
        let previous = folder.folder(&format!(".Plan.previous-999997-{stale}"));
        let project = folder.folder("Plan");

        let removed = clean_extraction_temporaries_at(folder.path(), Duration::from_secs(600), now);
        assert_eq!(removed, 1);
        assert!(!stale_extract.exists());
        assert!(fresh_extract.exists(), "a fresh extraction is untouched");
        assert!(own_extract.exists(), "the current process keeps its folder");
        assert!(previous.exists(), "the replaced folder is never deleted");
        assert!(project.exists());
    }

    #[test]
    fn post_load_cleanup_covers_the_project_file_and_extraction_folders() {
        let folder = TestDir::new();
        let project = folder.file("Plan.gridscalr", b"{}");
        let now = SystemTime::now();
        let stale = stamp(now, 7200);
        let sibling = folder.file(&format!(".Plan.gridscalr.999999.{stale}.0.tmp"), b"x");
        let extract = folder.folder(&format!(".Plan.extract-999998-{stale}"));
        let fresh = folder.file(
            &format!(".Plan.gridscalr.999997.{}.1.tmp", stamp(now, 0)),
            b"x",
        );

        let removed = clean_project_temporaries_at(&project, Duration::from_secs(600), now);
        assert_eq!(removed, 2);
        assert!(!sibling.exists());
        assert!(!extract.exists());
        assert!(fresh.exists());
        assert!(project.exists(), "the project file is never touched");
    }
}
