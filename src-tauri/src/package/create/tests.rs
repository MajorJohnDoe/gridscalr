//! Creation tests: request validation, streaming writes, checksum retries, the
//! pre-write limits and cancellation cleanup.
//!
//! Round trips that also inspect or extract a package live in `package::tests`.

use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use super::{create_package, create_package_with};
use crate::package::error::PackageError;
use crate::package::limits::MAX_TOTAL_BYTES;
use crate::package::test_support::{create, project_json, request, sha, write, TestDir};

#[test]
fn package_creation_never_modifies_a_source_drawing() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    let bytes = b"%PDF-1.4 source drawing";
    write(&source, bytes);
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", &sha(bytes))],
    );
    create(&request).expect("create package");
    assert!(output.is_file());
    assert_eq!(
        fs::read(&source).expect("read source"),
        bytes,
        "a source drawing is never modified by packaging"
    );
}

#[test]
fn rejects_a_missing_source_file() {
    let directory = TestDir::new();
    let output = directory.file("Plan.gridscalr.zip");
    let missing = directory.file("source/missing.pdf");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&missing, "documents/Plan.pdf", "")],
    );
    let error = create(&request).expect_err("missing source");
    match error {
        PackageError::MissingSource { files } => {
            assert_eq!(files.len(), 1);
            assert_eq!(files[0].name, "missing.pdf");
        }
        other => panic!("unexpected error: {other:?}"),
    }
    assert!(!output.exists());
}

#[test]
fn reports_a_checksum_mismatch_and_accepts_the_actual_file_on_retry() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    write(&source, b"%PDF-1.4 current");
    let output = directory.file("Plan.gridscalr.zip");
    let mut request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", &"0".repeat(64))],
    );
    let error = create(&request).expect_err("checksum mismatch");
    let mismatch = match error {
        PackageError::ChecksumMismatch { files } => files.into_iter().next().expect("one file"),
        other => panic!("unexpected error: {other:?}"),
    };
    assert_eq!(mismatch.name, "Plan.pdf");
    assert_eq!(mismatch.size_bytes, b"%PDF-1.4 current".len() as u64);
    assert!(!output.exists());

    request.documents[0].expected_sha256 = mismatch.actual;
    create(&request).expect("retry with the actual checksum");
    assert!(output.is_file());
}

#[test]
fn cancellation_leaves_no_package_or_temporary_file() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    write(&source, b"%PDF-1.4 plan");
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", "")],
    );
    let cancelled = AtomicBool::new(true);
    let error = create_package(&request, None, &cancelled).expect_err("cancelled");
    assert!(matches!(error, PackageError::Cancelled));
    assert!(!output.exists());
    assert!(fs::read_dir(directory.path())
        .expect("read directory")
        .all(|entry| !entry
            .expect("entry")
            .file_name()
            .to_string_lossy()
            .contains(".tmp")));
}

#[test]
fn cancellation_mid_write_cleans_the_temporary_file() {
    let directory = TestDir::new();
    let source = directory.file("source/Large.pdf");
    let bytes: Vec<u8> = (0..64 * 1024 * 1024)
        .map(|index| (index % 251) as u8)
        .collect();
    write(&source, &bytes);
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Large.pdf", ""),
        vec![(&source, "documents/Large.pdf", "")],
    );
    let cancelled = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&cancelled);
    let stopper = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(5));
        flag.store(true, Ordering::SeqCst);
    });
    let error = create_package(&request, None, &cancelled).expect_err("cancelled");
    stopper.join().expect("stopper thread");
    assert!(matches!(error, PackageError::Cancelled));
    assert!(!output.exists());
    let leftovers: Vec<String> = fs::read_dir(directory.path())
        .expect("read directory")
        .map(|entry| {
            entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .to_string()
        })
        .filter(|name| name.contains(".tmp"))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn rejects_duplicate_archive_names() {
    let directory = TestDir::new();
    let first = directory.file("source/a.pdf");
    let second = directory.file("source/b.pdf");
    write(&first, b"a");
    write(&second, b"b");
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Same.pdf", ""),
        vec![
            (&first, "documents/Same.pdf", ""),
            (&second, "documents/same.pdf", ""),
        ],
    );
    assert!(matches!(
        create(&request).expect_err("duplicate"),
        PackageError::InvalidPackage { .. }
    ));
}

#[test]
fn refuses_a_package_over_the_cap_before_writing_anything() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    write(&source, b"%PDF-1.4 plan");
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", "")],
    );

    let error = create_package_with(&request, None, &AtomicBool::new(false), 16, |_| {
        Some(u64::MAX)
    })
    .expect_err("over the cap");
    match error {
        PackageError::TooLarge {
            required_bytes,
            max_bytes,
        } => {
            assert_eq!(max_bytes, 16);
            assert!(
                required_bytes > max_bytes,
                "the reported size must exceed the cap"
            );
        }
        other => panic!("unexpected error: {other:?}"),
    }
    assert!(!output.exists(), "an over-cap package writes no file");
    let leftovers: Vec<String> = fs::read_dir(directory.path())
        .expect("read directory")
        .map(|entry| {
            entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .to_string()
        })
        .filter(|name| name.contains(".tmp"))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn refuses_a_package_when_the_destination_volume_is_too_small() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    write(&source, b"%PDF-1.4 plan");
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", "")],
    );

    let error = create_package_with(
        &request,
        None,
        &AtomicBool::new(false),
        MAX_TOTAL_BYTES,
        |_| Some(0),
    )
    .expect_err("no free space");
    assert!(
        matches!(
            error,
            PackageError::InsufficientSpace {
                required_bytes,
                available_bytes: 0
            } if required_bytes > 0
        ),
        "{error:?}"
    );
    assert!(!output.exists(), "a full destination writes no file");
}

#[test]
fn default_options_include_no_exports_or_scans() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    write(&source, b"pdf");
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", "")],
    );
    let result = create(&request).expect("create");
    assert!(result.manifest.exports.is_empty());
    assert!(result.manifest.source_scans.is_empty());
}
