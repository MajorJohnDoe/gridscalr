//! Manifest-validation tests: the documented uncompressed total and the fixed
//! metadata and path rules shared by writing and extraction.

use super::validate_manifest;
use crate::package::limits::{MAX_ENTRY_BYTES, PACKAGE_FORMAT, PACKAGE_FORMAT_VERSION};
use crate::package::types::{ManifestFile, PackageManifest};

#[test]
fn rejects_a_manifest_that_exceeds_the_uncompressed_total() {
    let entry = |index: usize| ManifestFile {
        file: format!("documents/Plan-{index}.pdf"),
        sha256: "0".repeat(64),
        size_bytes: MAX_ENTRY_BYTES,
        kind: "pdf".to_string(),
    };
    let manifest = PackageManifest {
        format: PACKAGE_FORMAT.to_string(),
        format_version: PACKAGE_FORMAT_VERSION,
        created_at: "2026-11-01T10:00:00.000Z".to_string(),
        app_version: "0.24.0".to_string(),
        project_file: "Plan.gridscalr".to_string(),
        project_sha256: "0".repeat(64),
        project_schema: 25,
        documents: (0..3).map(entry).collect(),
        exports: Vec::new(),
        source_scans: Vec::new(),
        derived_caches: Vec::new(),
    };
    let error = validate_manifest(&manifest).expect_err("over the total limit");
    assert!(
        format!("{error:?}").contains("extraction limit"),
        "{error:?}"
    );
}

#[test]
fn validates_manifest_metadata_and_paths() {
    let manifest = PackageManifest {
        format: PACKAGE_FORMAT.to_string(),
        format_version: PACKAGE_FORMAT_VERSION,
        created_at: "2026-11-01T10:00:00.000Z".to_string(),
        app_version: "0.16.1".to_string(),
        project_file: "Plan.gridscalr".to_string(),
        project_sha256: "0".repeat(64),
        project_schema: 21,
        documents: vec![ManifestFile {
            file: "documents/Plan.pdf".to_string(),
            sha256: "0".repeat(64),
            size_bytes: 10,
            kind: "pdf".to_string(),
        }],
        exports: Vec::new(),
        source_scans: Vec::new(),
        derived_caches: Vec::new(),
    };
    validate_manifest(&manifest).expect("valid manifest");

    let mut wrong_format = manifest.clone();
    wrong_format.format = "other".to_string();
    assert!(validate_manifest(&wrong_format).is_err());

    let mut wrong_version = manifest.clone();
    wrong_version.format_version = 99;
    assert!(validate_manifest(&wrong_version).is_err());

    let mut traversal = manifest.clone();
    traversal.documents[0].file = "documents/../Plan.pdf".to_string();
    assert!(validate_manifest(&traversal).is_err());

    let mut absolute = manifest.clone();
    absolute.project_file = "/tmp/Plan.gridscalr".to_string();
    assert!(validate_manifest(&absolute).is_err());
}
