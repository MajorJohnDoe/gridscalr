//! Windows-only path-guard cases (F-036, #199).
//!
//! The guard is Windows-relevant: drive-relative spellings, UNC prefixes, a
//! case-insensitive volume, trailing dots and spaces, verbatim-prefix
//! canonicalization and directory junctions all change what "the same file"
//! means. These cases run on the Windows `desktop` CI entry; the Linux entry
//! skips the module, so nothing here may depend on a POSIX path.
//!
//! Everything is temporary-directory based. The verbatim-prefix case always
//! runs; a host that cannot create a junction records the reason instead of
//! passing silently.

use super::{text, TestDir};
use crate::path_guard::{
    comparison_key, ensure_inside_root, ensure_writable, has_unc_prefix, is_drive_relative,
    resolved_path,
};

use std::fs;
use std::path::Path;

/// Creates a directory junction with `mklink /J`, which needs no privilege on
/// NTFS. The error names the reason a host could not provide one, so a skipped
/// junction case is reported rather than hidden.
fn create_junction(link: &Path, target: &Path) -> Result<(), String> {
    let output = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()
        .map_err(|error| format!("cmd.exe /C mklink /J could not start: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "mklink /J exited with {}: {}{}",
        output.status,
        String::from_utf8_lossy(&output.stdout).trim(),
        String::from_utf8_lossy(&output.stderr).trim()
    ))
}

#[test]
fn canonicalizes_to_a_verbatim_prefix_and_compares_it_as_the_plain_path() {
    let directory = TestDir::new();
    let file = directory.file("Plan.pdf", b"%PDF-1.4 plan");
    let canonical = fs::canonicalize(&file).expect("canonicalize fixture");
    let canonical_text = canonical.to_string_lossy().to_string();
    assert!(
        canonical_text.starts_with(r"\\?\"),
        "Windows canonicalize must produce a verbatim prefix: {canonical_text}"
    );
    // The guard compares an unresolved spelling against a canonical one, so the
    // `\\?\` prefix has to be stripped. Removing that branch in
    // `comparison_key()` fails this assertion on every Windows run.
    assert_eq!(comparison_key(&canonical), comparison_key(&file));
    assert_eq!(comparison_key(&resolved_path(&file)), comparison_key(&file));

    let error = ensure_writable(&text(&canonical), &[text(&file)]).expect_err("same file");
    assert_eq!(error.code, "sourceOverwrite");
}

#[test]
fn refuses_a_case_variant_of_an_existing_source() {
    let directory = TestDir::new();
    let source = directory.file("Level 01/Plan.pdf", b"%PDF-1.4 plan");
    let variant = directory.path().join("level 01").join("PLAN.PDF");
    if !variant.exists() {
        // A case-sensitive folder (an opt-in NTFS flag) stores two files. The
        // comparison key is still case-folded, which is the guard's contract.
        assert_eq!(comparison_key(&variant), comparison_key(&source));
        return;
    }
    let error = ensure_writable(&text(&variant), &[text(&source)]).expect_err("case alias");
    assert_eq!(error.code, "sourceOverwrite");
}

#[test]
fn refuses_a_trailing_dot_or_space_alias_of_a_protected_source() {
    let directory = TestDir::new();
    let source = directory.file("Plan.pdf", b"%PDF-1.4 plan");
    for alias in ["Plan.pdf.", "Plan.pdf "] {
        let target = directory.path().join(alias);
        // The Win32 layer strips the trailing character when it opens the file,
        // so this spelling reaches the protected source.
        assert!(
            fs::canonicalize(&target).is_ok(),
            "{alias} must alias the source on this volume"
        );
        let error =
            ensure_writable(&text(&target), &[text(&source)]).expect_err("alias of the source");
        assert_eq!(error.code, "sourceOverwrite", "{alias}");
    }
}

#[test]
fn rejects_drive_relative_spellings_but_not_rooted_ones() {
    let protected = vec![r"C:\Drawings\Plan.pdf".to_string()];
    for spelling in [
        r"C:Drawings\Plan.pdf",
        r"c:plan.pdf",
        r"D:Level 01\Plan.pdf",
    ] {
        let error = ensure_writable(spelling, &protected).expect_err("drive-relative spelling");
        assert_eq!(error.code, "invalidPath", "{spelling}");
    }
    // A rooted spelling is unambiguous and reaches the normal comparison.
    let error = ensure_writable(r"c:\drawings\PLAN.pdf", &protected).expect_err("case variant");
    assert_eq!(error.code, "sourceOverwrite");
    assert!(!is_drive_relative(Path::new(r"C:\Drawings\Plan.pdf")));
    assert!(is_drive_relative(Path::new(r"C:Plan.pdf")));
}

#[test]
fn compares_unc_spellings_by_server_and_share() {
    for spelling in [
        r"\\fileserver\projects\Level 01.drawings\Plan.pdf",
        "//FILESERVER/Projects/Level 01.drawings/Plan.pdf",
    ] {
        let path = Path::new(spelling);
        assert!(has_unc_prefix(path), "{spelling}");
        // Separators are normalised to one forward slash, so the server and
        // share stay the first key components and the comparison is
        // case-folded.
        assert_eq!(
            comparison_key(path),
            "/fileserver/projects/level 01.drawings/plan.pdf",
            "{spelling}"
        );
    }
    // A verbatim UNC prefix names the same share as the plain spelling.
    assert_eq!(
        comparison_key(Path::new(r"\\?\UNC\fileserver\projects\Plan.pdf")),
        comparison_key(Path::new(r"\\fileserver\projects\Plan.pdf"))
    );
    assert_eq!(
        comparison_key(Path::new(r"\\?\C:\Drawings\Plan.pdf")),
        comparison_key(Path::new(r"C:\Drawings\Plan.pdf"))
    );
    // A drive letter and a relative spelling are not UNC prefixes, and a
    // rooted drive spelling resolves to its canonical form.
    assert!(!has_unc_prefix(Path::new(r"C:\Drawings\Plan.pdf")));
    assert!(!has_unc_prefix(Path::new(r"Drawings\Plan.pdf")));
    assert!(
        comparison_key(&resolved_path(Path::new(r"C:\Drawings\Plan.pdf")))
            .starts_with("c:/drawings/")
    );
}

#[test]
fn refuses_a_managed_folder_that_escapes_the_project_through_a_junction() {
    let directory = TestDir::new();
    let project = directory.path().join("project");
    let outside = directory.path().join("outside");
    fs::create_dir_all(&project).expect("create project");
    fs::create_dir_all(&outside).expect("create outside");
    fs::write(outside.join("Plan.pdf"), b"%PDF-1.4 outside").expect("write outside file");

    let drawings = project.join("Level 01.drawings");
    if let Err(reason) = create_junction(&drawings, &outside) {
        // The verbatim-prefix case above always covers the canonicalization
        // branch; record why this host could not contribute the junction case.
        assert!(
            !reason.trim().is_empty(),
            "a skipped junction case must record why"
        );
        eprintln!("skipping the junction escape check on this Windows host: {reason}");
        return;
    }

    let escaped = fs::canonicalize(&drawings).expect("canonicalize junction");
    let outside_key = comparison_key(&fs::canonicalize(&outside).expect("canonicalize outside"));
    assert!(
        comparison_key(&escaped).starts_with(&outside_key),
        "the junction must resolve outside the project"
    );
    let error = ensure_inside_root(&drawings.join("Plan.pdf"), &project, "unsafePath")
        .expect_err("a junctioned drawings folder must be rejected");
    assert_eq!(error.code, "unsafePath");

    // The write guard reaches the same conclusion for the same reason.
    let error = ensure_writable(&text(&drawings.join("Plan.pdf")), &[text(&drawings)])
        .expect_err("inside the junctioned folder");
    assert_eq!(error.code, "sourceOverwrite");
    assert_eq!(
        fs::read(outside.join("Plan.pdf")).expect("read outside file"),
        b"%PDF-1.4 outside"
    );
}
