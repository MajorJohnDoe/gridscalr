//! Extraction tests: cancellation cleanup, reuse and replacement of an existing
//! extraction, and the destination free-space guard.

use std::fs;
use std::sync::atomic::AtomicBool;

use super::{ensure_free_space, extract_package};
use crate::disk_space;
use crate::package::error::PackageError;
use crate::package::names::path_string;
use crate::package::test_support::{create, project_json, request, write, TestDir};
use crate::package::types::ExtractRequest;

#[test]
fn cancellation_during_extraction_removes_the_temporary_folder() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    write(&source, b"pdf");
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", "")],
    );
    create(&request).expect("create");
    let cancelled = AtomicBool::new(true);
    let error = extract_package(
        &ExtractRequest {
            job_id: "extract".to_string(),
            package_path: path_string(&output),
            destination_path: path_string(&directory.file("Cancelled")),
            mode: "new".to_string(),
        },
        None,
        &cancelled,
    )
    .expect_err("cancel");
    assert!(matches!(error, PackageError::Cancelled));
    assert!(!directory.file("Cancelled").exists());
    let leftovers: Vec<String> = fs::read_dir(directory.path())
        .expect("read directory")
        .map(|entry| {
            entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .to_string()
        })
        .filter(|name| name.contains(".extract-"))
        .collect();
    assert!(leftovers.is_empty(), "{leftovers:?}");
}

#[test]
fn reuses_and_replaces_an_existing_extraction() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    write(&source, b"pdf");
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", "")],
    );
    create(&request).expect("create");
    let destination = directory.file("Existing");
    let extract = |mode: &str| {
        extract_package(
            &ExtractRequest {
                job_id: "extract".to_string(),
                package_path: path_string(&output),
                destination_path: path_string(&destination),
                mode: mode.to_string(),
            },
            None,
            &AtomicBool::new(false),
        )
    };
    extract("new").expect("first extraction");
    // The extracted copy may be edited; opening it again must still work.
    fs::write(
        destination.join("Plan.gridscalr"),
        project_json("documents/Plan.pdf", r#""edited":true"#),
    )
    .expect("edit extracted project");
    extract("reuse").expect("reuse edited extraction");
    extract("replace").expect("replace");
    assert!(destination.join("Plan.gridscalr").is_file());
    assert!(destination.join("documents/Plan.pdf").is_file());
}

#[test]
fn refuses_extraction_when_the_destination_volume_is_too_small() {
    let needed = disk_space::required_bytes(1024);
    let error = ensure_free_space(Some(needed - 1), 1024).expect_err("no space");
    assert!(
        matches!(
            error,
            PackageError::InsufficientSpace {
                required_bytes,
                available_bytes
            } if required_bytes == needed && available_bytes == needed - 1
        ),
        "{error:?}"
    );
    assert!(ensure_free_space(Some(needed), 1024).is_ok());
    assert!(ensure_free_space(None, 1024).is_ok());
}
