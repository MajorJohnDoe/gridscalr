use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "gridscalr-path-guard-test-{}-{counter}",
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
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(&path, bytes).expect("write fixture");
        path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn text(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[test]
fn blocks_a_protected_source_path_regardless_of_case() {
    let protected = vec!["/home/ana/Plan.pdf".to_string()];
    let error = ensure_writable("/home/ana/plan.pdf", &protected).expect_err("protected");
    assert_eq!(error.code, "sourceOverwrite");
}

#[test]
fn blocks_a_case_insensitive_windows_path_and_unc_spelling() {
    let protected = vec!["C:\\Drawings\\Plan.pdf".to_string()];
    assert!(ensure_writable("c:/drawings/PLAN.pdf", &protected).is_err());

    let unc = vec!["\\\\fileserver\\projects\\Plan.pdf".to_string()];
    assert!(ensure_writable("//FILESERVER/Projects/plan.pdf", &unc).is_err());
}

#[test]
fn strips_a_windows_verbatim_prefix_before_comparing() {
    let first = comparison_key(Path::new(r"\\?\C:\Drawings\Plan.pdf"));
    let second = comparison_key(Path::new(r"c:\drawings\plan.pdf"));
    assert_eq!(first, second);
    let unc = comparison_key(Path::new(r"\\?\UNC\server\share\Plan.pdf"));
    assert_eq!(unc, comparison_key(Path::new("//server/share/plan.pdf")));
}

#[test]
fn anchors_a_relative_path_to_the_current_directory_before_comparing() {
    let relative = Path::new("plan.gridscalr");
    let absolute = std::env::current_dir()
        .expect("current directory")
        .join("plan.gridscalr");
    assert_eq!(
        comparison_key(&resolved_path(relative)),
        comparison_key(&resolved_path(&absolute)),
        "one file must produce one key however it is spelled"
    );
}

#[test]
fn rejects_a_drive_relative_spelling_against_a_protected_windows_path() {
    // On Windows `C:Plan.pdf` is relative to the drive's current directory,
    // while `C:\Plan.pdf` is rooted. The guard cannot prove they differ, so it
    // refuses the write instead of assuming it is safe.
    let protected = vec![r"C:\Drawings\Plan.pdf".to_string()];
    assert!(ensure_writable(r"C:Drawings\Plan.pdf", &protected).is_err());
}

#[test]
fn refuses_a_unc_target_inside_a_protected_unc_folder() {
    let root = Path::new(r"\\fileserver\projects\Level 01.drawings");
    let target = Path::new(r"\\FILESERVER\Projects\Level 01.drawings\Plan.pdf");
    assert!(is_inside(target, root));
    let error = ensure_writable(
        r"\\fileserver\projects\Level 01.drawings\Plan.pdf",
        &[r"\\fileserver\projects\Level 01.drawings".to_string()],
    )
    .expect_err("inside protected folder");
    assert_eq!(error.code, "sourceOverwrite");
}

#[test]
fn refuses_two_distinct_case_variant_files_instead_of_assuming_one() {
    let first = TestDir::new();
    let upper = first.file("Plan.pdf", b"upper");
    let lower_path = first.path().join("plan.pdf");
    if fs::write(&lower_path, b"lower").is_err() {
        // A case-insensitive volume stores one file only; the conservative
        // comparison still refuses the protected target.
        assert!(ensure_writable(&text(&lower_path), &[text(&upper)]).is_err());
        return;
    }
    // Both files exist. The guard cannot know which one the user meant, so it
    // refuses rather than guessing.
    let error = ensure_writable(&text(&lower_path), &[text(&upper)]).expect_err("ambiguous");
    assert_eq!(error.code, "sourceOverwrite");
}

#[test]
fn rejects_a_destination_inside_the_managed_copy_folder() {
    let directory = TestDir::new();
    let drawings = directory.path().join("Level 01.drawings");
    fs::create_dir_all(&drawings).expect("create drawings");
    let destination = drawings.join("Plan-1234abcd.pdf");
    let error = ensure_writable(&text(&destination), &[text(&drawings)]).expect_err("inside");
    assert_eq!(error.code, "sourceOverwrite");
}

#[test]
fn rejects_a_destination_inside_a_managed_folder_that_does_not_exist_yet() {
    let directory = TestDir::new();
    let drawings = directory.path().join("Level 01.drawings");
    let destination = drawings.join("new-export.pdf");
    let error = ensure_writable(&text(&destination), &[text(&drawings)]).expect_err("inside");
    assert_eq!(error.code, "sourceOverwrite");
}

#[test]
fn rejects_a_traversal_spelling_of_a_protected_source() {
    let directory = TestDir::new();
    let source = directory.file("drawings/Plan.pdf", b"source");
    let alternate = directory.path().join("other/../drawings/./Plan.pdf");
    assert!(ensure_writable(&text(&alternate), &[text(&source)]).is_err());
}

/// The temporary folder is behind a symbolic link on macOS (`/var` is
/// `/private/var`), so the plain traversal test above cannot see a guard that
/// only normalises the spelling lexically. This one builds the link itself, so
/// the case is covered on every Unix host.
#[cfg(unix)]
#[test]
fn rejects_a_traversal_spelling_that_crosses_a_symbolic_link() {
    use std::os::unix::fs::symlink;

    let directory = TestDir::new();
    let real = directory.path().join("real");
    fs::create_dir_all(real.join("drawings")).expect("create real folder");
    fs::write(real.join("drawings/Plan.pdf"), b"source").expect("write source");
    let link = directory.path().join("link");
    symlink(&real, &link).expect("create symlink");

    let source = link.join("drawings/Plan.pdf");
    let alternate = link.join("other/../drawings/./Plan.pdf");
    let error = ensure_writable(&text(&alternate), &[text(&source)]).expect_err("traversal");
    assert_eq!(error.code, "sourceOverwrite");
}

#[cfg(unix)]
#[test]
fn rejects_a_managed_folder_that_is_a_symlink_outside_the_project() {
    use std::os::unix::fs::symlink;

    let directory = TestDir::new();
    let project = directory.path().join("project");
    let outside = directory.path().join("outside");
    fs::create_dir_all(&project).expect("create project");
    fs::create_dir_all(&outside).expect("create outside");
    symlink(&outside, project.join("Level 01.drawings")).expect("create symlink");

    let drawings = project.join("Level 01.drawings");
    let error = ensure_inside_root(&drawings.join("Plan.pdf"), &project, "unsafePath")
        .expect_err("escape must be rejected");
    assert_eq!(error.code, "unsafePath");
}

#[cfg(unix)]
#[test]
fn allows_a_project_folder_that_is_itself_a_symlink() {
    use std::os::unix::fs::symlink;

    let directory = TestDir::new();
    let real = directory.path().join("real");
    fs::create_dir_all(&real).expect("create real");
    let link = directory.path().join("link");
    symlink(&real, &link).expect("create symlink");

    assert!(ensure_inside_root(&link.join("Level 01.gridscalr"), &link, "unsafePath").is_ok());
}

#[test]
fn rejects_an_empty_target_instead_of_assuming_it_is_free() {
    let error = ensure_writable("   ", &["/home/ana/Plan.pdf".to_string()]).expect_err("empty");
    assert_eq!(error.code, "invalidPath");
}

#[test]
fn bounded_reads_accept_the_limit_and_reject_one_byte_more() {
    let directory = TestDir::new();
    let file = directory.file("project.gridscalr", b"0123456789");
    assert_eq!(read_limited(&file, 10).expect("at limit").len(), 10);
    let error = read_limited(&file, 9).expect_err("over limit");
    assert_eq!(error.code, "fileTooLarge");
    assert!(read_text_limited(&file, 10).is_ok());
}

/// Windows-only cases: drive-relative spellings, UNC prefixes, a real
/// case-insensitive volume, trailing-dot aliases, verbatim-prefix
/// canonicalization and a junction escape (F-036, #199). The module is skipped
/// on every other host, so it may not depend on a POSIX path.
#[cfg(windows)]
#[path = "path_guard_windows_tests.rs"]
mod windows;
