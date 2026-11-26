//! Pre-write validation of a package request.
//!
//! Every name, kind, duplicate, project reference and source file is checked
//! before the output is touched, so a rejected request leaves no temporary file.

use std::collections::HashSet;
use std::fs;

use crate::path_guard::ensure_writable;

use super::error::{MissingFile, PackageError};
use super::limits::MAX_ENTRY_BYTES;
use super::names::validate_archive_name;
use super::project::validate_project_json;
use super::types::PackageRequest;

/// Checks the request and returns the sizes of every source file it will read.
pub(crate) fn validate_request(request: &PackageRequest) -> Result<Vec<u64>, PackageError> {
    ensure_writable(&request.output_path, &request.protected_paths)?;
    validate_archive_name(&request.project_file_name, None)?;
    if !request.project_file_name.ends_with(".gridscalr") {
        return Err(PackageError::InvalidPackage {
            message: "The package project file must end with .gridscalr.".to_string(),
        });
    }
    if request.project_json.len() as u64 > MAX_ENTRY_BYTES {
        return Err(PackageError::InvalidPackage {
            message: "The project file is larger than the package limit.".to_string(),
        });
    }

    let mut used_names: HashSet<String> = HashSet::new();
    used_names.insert(request.project_file_name.to_lowercase());
    used_names.insert("manifest.json".to_string());
    used_names.insert("readme.txt".to_string());
    let mut document_paths = HashSet::new();
    for document in &request.documents {
        validate_archive_name(&document.archive_path, Some("documents/"))?;
        if document.kind != "pdf" && document.kind != "tiff" {
            return Err(PackageError::InvalidPackage {
                message: format!(
                    "“{}” has an unsupported document kind.",
                    document.archive_path
                ),
            });
        }
        if !used_names.insert(document.archive_path.to_lowercase()) {
            return Err(PackageError::InvalidPackage {
                message: format!(
                    "The package would contain “{}” more than once.",
                    document.archive_path
                ),
            });
        }
        if document.kind == "pdf" {
            document_paths.insert(document.archive_path.clone());
        }
    }
    for addition in request
        .exports
        .iter()
        .map(|entry| (&entry.archive_path, "exports/"))
    {
        validate_archive_name(addition.0, Some(addition.1))?;
        if !used_names.insert(addition.0.to_lowercase()) {
            return Err(PackageError::InvalidPackage {
                message: format!("The package would contain “{}” more than once.", addition.0),
            });
        }
    }
    for cache in &request.derived_caches {
        validate_archive_name(&cache.archive_path, Some("derived/"))?;
        if cache.kind != "derived" {
            return Err(PackageError::InvalidPackage {
                message: format!("“{}” is not a derived-PDF cache.", cache.archive_path),
            });
        }
        if !used_names.insert(cache.archive_path.to_lowercase()) {
            return Err(PackageError::InvalidPackage {
                message: format!(
                    "The package would contain “{}” more than once.",
                    cache.archive_path
                ),
            });
        }
    }
    for scan in &request.source_scans {
        validate_archive_name(&scan.archive_path, Some("source-scans/"))?;
        if scan.kind != "tiff" {
            return Err(PackageError::InvalidPackage {
                message: format!("“{}” is not a TIF source scan.", scan.archive_path),
            });
        }
        if !used_names.insert(scan.archive_path.to_lowercase()) {
            return Err(PackageError::InvalidPackage {
                message: format!(
                    "The package would contain “{}” more than once.",
                    scan.archive_path
                ),
            });
        }
    }
    validate_project_json(&request.project_json, &document_paths)?;

    let mut missing = Vec::new();
    let mut source_sizes = Vec::new();
    for source in request
        .documents
        .iter()
        .chain(request.source_scans.iter())
        .chain(request.derived_caches.iter())
    {
        match fs::metadata(&source.source_path) {
            Ok(metadata) if metadata.is_file() => source_sizes.push(metadata.len()),
            _ => missing.push(MissingFile {
                name: source
                    .source_path
                    .rsplit(['/', '\\'])
                    .next()
                    .unwrap_or(&source.source_path)
                    .to_string(),
                path: source.source_path.clone(),
            }),
        }
    }
    if !missing.is_empty() {
        return Err(PackageError::MissingSource { files: missing });
    }

    Ok(source_sizes)
}
