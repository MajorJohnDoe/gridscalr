//! Archive-inspection tests: unsafe entry names, symlinks, encryption, entry
//! and manifest limits, and files that the manifest does not list.

use std::fs::{self, File};
use std::io::Write;

use super::inspect_package;
use crate::package::error::PackageError;
use crate::package::hash::hash_bytes;
use crate::package::limits::{
    MAX_ENTRIES, MAX_ENTRY_BYTES, PACKAGE_FORMAT, PACKAGE_FORMAT_VERSION,
};
use crate::package::manifest::validate_manifest_file;
use crate::package::test_support::TestDir;
use crate::package::types::{ManifestFile, PackageManifest};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[test]
fn rejects_zip_slip_and_absolute_entry_names() {
    let directory = TestDir::new();
    for (name, entry) in [
        ("slip.zip", "../evil.txt"),
        ("absolute.zip", "/evil.txt"),
        ("drive.zip", "C:/evil.txt"),
        ("drive-relative.zip", "C:evil.txt"),
        ("unc.zip", r"\\server\share\evil.txt"),
        ("backslash-slip.zip", r"..\evil.txt"),
        ("control.zip", "evil\u{1}.txt"),
    ] {
        let path = directory.file(name);
        let file = File::create(&path).expect("create archive");
        let mut zip = ZipWriter::new(file);
        zip.start_file(entry, SimpleFileOptions::default())
            .expect("start entry");
        zip.write_all(b"evil").expect("write entry");
        zip.finish().expect("finish archive");
        let error = inspect_package(&path).expect_err("unsafe name");
        assert!(
            matches!(error, PackageError::InvalidPackage { .. }),
            "{name}: {error:?}"
        );
    }
}

#[test]
fn rejects_a_symlink_entry() {
    let directory = TestDir::new();
    let path = directory.file("symlink.zip");
    let file = File::create(&path).expect("create archive");
    let mut zip = ZipWriter::new(file);
    zip.add_symlink(
        "documents/link.pdf",
        "/etc/passwd",
        SimpleFileOptions::default(),
    )
    .expect("add symlink");
    zip.finish().expect("finish archive");
    let error = inspect_package(&path).expect_err("symlink");
    assert!(matches!(error, PackageError::InvalidPackage { .. }));
    assert!(format!("{error:?}").contains("symbolic link"), "{error:?}");
}

#[test]
fn rejects_an_encrypted_entry() {
    let directory = TestDir::new();
    let path = directory.file("encrypted.zip");
    let file = File::create(&path).expect("create archive");
    let mut zip = ZipWriter::new(file);
    zip.start_file("README.txt", SimpleFileOptions::default())
        .expect("start entry");
    zip.write_all(b"hello").expect("write entry");
    zip.finish().expect("finish archive");
    let mut bytes = fs::read(&path).expect("read archive");
    if bytes.len() > 8 {
        bytes[6] |= 1;
    }
    let mut index = 0;
    while index + 10 <= bytes.len() {
        if &bytes[index..index + 4] == b"PK\x01\x02" {
            bytes[index + 8] |= 1;
        }
        index += 1;
    }
    fs::write(&path, bytes).expect("write encrypted flag");
    let error = inspect_package(&path).expect_err("encrypted");
    assert!(matches!(error, PackageError::InvalidPackage { .. }));
    assert!(format!("{error:?}").contains("Encrypted"));
}

#[test]
fn rejects_too_many_entries_and_oversized_manifest_files() {
    let directory = TestDir::new();
    let path = directory.file("many.zip");
    let file = File::create(&path).expect("create archive");
    let mut zip = ZipWriter::new(file);
    for index in 0..=MAX_ENTRIES {
        zip.start_file(format!("file-{index}.txt"), SimpleFileOptions::default())
            .expect("start entry");
        zip.write_all(b"x").expect("write entry");
    }
    zip.finish().expect("finish archive");
    let error = inspect_package(&path).expect_err("too many entries");
    assert!(format!("{error:?}").contains("more than"));

    let oversized = ManifestFile {
        file: "documents/Plan.pdf".to_string(),
        sha256: "0".repeat(64),
        size_bytes: MAX_ENTRY_BYTES + 1,
        kind: "pdf".to_string(),
    };
    assert!(validate_manifest_file(&oversized, "documents/").is_err());
}

#[test]
fn rejects_unknown_archive_entries() {
    let directory = TestDir::new();
    let project = r#"{"schemaVersion":21,"name":"Plan","documents":[],"layers":[]}"#;
    let manifest = PackageManifest {
        format: PACKAGE_FORMAT.to_string(),
        format_version: PACKAGE_FORMAT_VERSION,
        created_at: "2026-11-01T10:00:00.000Z".to_string(),
        app_version: "0.16.1".to_string(),
        project_file: "Plan.gridscalr".to_string(),
        project_sha256: hash_bytes(project.as_bytes()),
        project_schema: 21,
        documents: Vec::new(),
        exports: Vec::new(),
        source_scans: Vec::new(),
        derived_caches: Vec::new(),
    };
    let manifest_json = serde_json::to_string_pretty(&manifest).expect("manifest");
    let path = directory.file("extra.zip");
    let file = File::create(&path).expect("create archive");
    let mut zip = ZipWriter::new(file);
    for (name, data) in [
        ("README.txt", "readme"),
        ("Plan.gridscalr", project),
        ("manifest.json", manifest_json.as_str()),
        ("notes.txt", "extra"),
    ] {
        zip.start_file(name, SimpleFileOptions::default())
            .expect("start entry");
        zip.write_all(data.as_bytes()).expect("write entry");
    }
    zip.finish().expect("finish archive");
    let error = inspect_package(&path).expect_err("unknown entry");
    assert!(
        format!("{error:?}").contains("unexpected file"),
        "{error:?}"
    );
}
