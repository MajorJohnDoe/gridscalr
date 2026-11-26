//! Cross-module round trips: the package a user opens again, unzips by hand, or
//! carries a large drawing and a derived cache through.

use std::fs::{self, File};
use std::path::Path;
use std::sync::atomic::AtomicBool;

use zip::ZipArchive;

use super::extract::extract_package;
use super::inspect::inspect_package;
use super::limits::PACKAGE_FORMAT;
use super::names::path_string;
use super::test_support::{create, project_json, request, sha, write, TestDir};
use super::types::{ExtractRequest, PackageSource};

#[test]
fn carries_a_derived_cache_and_states_its_form() {
    let directory = TestDir::new();
    let cache = directory.file("cache/level.derived/aaaa-v1-p1.pdf");
    write(&cache, b"%PDF-1.7 derived scan");
    let source = directory.file("source/Plan.pdf");
    write(&source, b"%PDF-1.4 plan");
    let output = directory.file("Plan.gridscalr.zip");
    let mut request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", &sha(b"%PDF-1.4 plan"))],
    );
    request.derived_caches = vec![PackageSource {
        source_path: path_string(&cache),
        archive_path: "derived/Plan.pdf".to_string(),
        kind: "derived".to_string(),
        expected_sha256: sha(b"%PDF-1.7 derived scan"),
    }];

    let created = create(&request).expect("create package");
    assert_eq!(created.manifest.derived_caches.len(), 1);
    assert_eq!(created.manifest.derived_caches[0].file, "derived/Plan.pdf");
    assert_eq!(created.manifest.derived_caches[0].kind, "derived");
    assert!(created.manifest.source_scans.is_empty());

    let extraction = extract_package(
        &ExtractRequest {
            job_id: "extract-derived".to_string(),
            package_path: created.output_path.clone(),
            destination_path: path_string(&directory.file("extracted")),
            mode: "new".to_string(),
        },
        None,
        &AtomicBool::new(false),
    )
    .expect("extract");
    assert!(Path::new(&extraction.extracted_to)
        .join("derived/Plan.pdf")
        .is_file());
    assert_eq!(
        extraction.manifest.derived_caches.len(),
        1,
        "the extracted manifest keeps the form it carried"
    );
}

#[test]
fn round_trips_a_package_and_supports_manual_unzip() {
    let directory = TestDir::new();
    let source = directory.file("source/Plan.pdf");
    write(&source, b"%PDF-1.4 plan");
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Plan.pdf", ""),
        vec![(&source, "documents/Plan.pdf", &sha(b"%PDF-1.4 plan"))],
    );

    let created = create(&request).expect("create package");
    assert_eq!(created.manifest.documents.len(), 1);
    assert_eq!(created.manifest.format, PACKAGE_FORMAT);
    assert!(output.is_file());

    let inspection = inspect_package(&output).expect("inspect package");
    assert!(!inspection.destination_exists);
    assert_eq!(inspection.project_name, "Plan");
    assert_eq!(inspection.manifest.project_file, "Plan.gridscalr");

    let extraction = extract_package(
        &ExtractRequest {
            job_id: "extract".to_string(),
            package_path: path_string(&output),
            destination_path: inspection.destination_path.clone(),
            mode: "new".to_string(),
        },
        None,
        &AtomicBool::new(false),
    )
    .expect("extract package");
    assert_eq!(
        fs::read(&extraction.project_path).expect("read project"),
        request.project_json.as_bytes()
    );
    assert!(Path::new(&extraction.extracted_to)
        .join("documents/Plan.pdf")
        .is_file());
    assert!(Path::new(&extraction.extracted_to)
        .join("README.txt")
        .is_file());
    assert!(Path::new(&extraction.extracted_to)
        .join("manifest.json")
        .is_file());

    // Manual unzip without the app: every entry is a normal relative file.
    let manual = directory.file("manual");
    fs::create_dir_all(&manual).expect("create manual folder");
    let mut archive =
        ZipArchive::new(File::open(&output).expect("open package")).expect("read package");
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).expect("entry");
        let name = entry.enclosed_name().expect("safe name");
        let target = manual.join(name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).expect("create manual parent");
        }
        let mut file = File::create(target).expect("create manual file");
        std::io::copy(&mut entry, &mut file).expect("copy manual entry");
    }
    let manual_project = fs::read_to_string(manual.join("Plan.gridscalr")).expect("manual project");
    let value: serde_json::Value = serde_json::from_str(&manual_project).expect("project json");
    assert_eq!(
        value["documents"][0]["relativePath"],
        serde_json::Value::String("documents/Plan.pdf".to_string())
    );
    assert!(value["documents"][0]["path"].is_null());
    assert!(manual.join("documents/Plan.pdf").is_file());
}

#[test]
fn keeps_unicode_and_long_names() {
    let directory = TestDir::new();
    let source = directory.file("source/Översiktsplan.pdf");
    write(&source, b"pdf");
    let long_name = format!("{}.pdf", "a".repeat(150));
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Översiktsplan.pdf", ""),
        vec![
            (&source, "documents/Översiktsplan.pdf", ""),
            (&source, &format!("documents/{long_name}"), ""),
        ],
    );
    create(&request).expect("unicode and long names");
    let inspection = inspect_package(&output).expect("inspect");
    assert_eq!(inspection.manifest.documents.len(), 2);
}

#[test]
fn streams_a_large_file_through_the_package() {
    let directory = TestDir::new();
    let source = directory.file("source/Large.pdf");
    let bytes: Vec<u8> = (0..16 * 1024 * 1024)
        .map(|index| (index % 251) as u8)
        .collect();
    write(&source, &bytes);
    let output = directory.file("Plan.gridscalr.zip");
    let request = request(
        &output,
        &project_json("documents/Large.pdf", ""),
        vec![(&source, "documents/Large.pdf", &sha(&bytes))],
    );
    create(&request).expect("large package");
    let extraction = extract_package(
        &ExtractRequest {
            job_id: "extract".to_string(),
            package_path: path_string(&output),
            destination_path: path_string(&directory.file("Large.")),
            mode: "new".to_string(),
        },
        None,
        &AtomicBool::new(false),
    )
    .expect("extract large package");
    assert_eq!(
        fs::metadata(Path::new(&extraction.extracted_to).join("documents/Large.pdf"))
            .expect("large file")
            .len(),
        bytes.len() as u64
    );
}
