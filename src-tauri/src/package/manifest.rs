//! The package manifest: shape, reserved names, checksums, sizes and the README
//! that explains a manual unzip.
//!
//! A manifest is validated both when it is written and before any byte of a
//! package is extracted. The same rules run in both directions so a package the
//! app creates can always be opened by the same build.

use std::collections::HashSet;

use super::error::PackageError;
use super::limits::{MAX_ENTRY_BYTES, MAX_TOTAL_BYTES, PACKAGE_FORMAT, PACKAGE_FORMAT_VERSION};
use super::names::validate_archive_name;
use super::types::{ManifestFile, PackageManifest};

fn is_hex_sha256(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

pub(crate) fn validate_manifest_file(
    file: &ManifestFile,
    prefix: &str,
) -> Result<(), PackageError> {
    validate_archive_name(&file.file, Some(prefix))?;
    if !is_hex_sha256(&file.sha256) {
        return Err(PackageError::InvalidPackage {
            message: format!("The manifest has an invalid SHA-256 for “{}”.", file.file),
        });
    }
    if file.size_bytes > MAX_ENTRY_BYTES {
        return Err(PackageError::InvalidPackage {
            message: format!("“{}” is larger than the package limit.", file.file),
        });
    }
    if file.kind.trim().is_empty() {
        return Err(PackageError::InvalidPackage {
            message: format!("The manifest has no kind for “{}”.", file.file),
        });
    }
    Ok(())
}

pub fn validate_manifest(manifest: &PackageManifest) -> Result<(), PackageError> {
    if manifest.format != PACKAGE_FORMAT {
        return Err(PackageError::InvalidPackage {
            message: "This ZIP is not a GridScalr project package.".to_string(),
        });
    }
    if manifest.format_version != PACKAGE_FORMAT_VERSION {
        return Err(PackageError::InvalidPackage {
            message: format!(
                "This package uses format version {}. GridScalr supports version {PACKAGE_FORMAT_VERSION}.",
                manifest.format_version
            ),
        });
    }
    if manifest.project_schema == 0 {
        return Err(PackageError::InvalidPackage {
            message: "The package does not name a project schema version.".to_string(),
        });
    }
    if manifest.app_version.trim().is_empty() || manifest.created_at.trim().is_empty() {
        return Err(PackageError::InvalidPackage {
            message: "The package manifest is missing its creation metadata.".to_string(),
        });
    }
    if !manifest.project_file.ends_with(".gridscalr")
        || manifest.project_file.contains(['/', '\\'])
        || manifest.project_file.contains("..")
        || manifest.project_file.trim().is_empty()
    {
        return Err(PackageError::InvalidPackage {
            message: "The package manifest names an invalid project file.".to_string(),
        });
    }
    if !is_hex_sha256(&manifest.project_sha256) {
        return Err(PackageError::InvalidPackage {
            message: "The package manifest has an invalid project checksum.".to_string(),
        });
    }
    for file in &manifest.documents {
        validate_manifest_file(file, "documents/")?;
        if file.kind != "pdf" && file.kind != "tiff" {
            return Err(PackageError::InvalidPackage {
                message: format!("“{}” has an unsupported document kind.", file.file),
            });
        }
    }
    for file in &manifest.exports {
        validate_manifest_file(file, "exports/")?;
    }
    for file in &manifest.source_scans {
        validate_manifest_file(file, "source-scans/")?;
        if file.kind != "tiff" {
            return Err(PackageError::InvalidPackage {
                message: format!("“{}” is not a TIF source scan.", file.file),
            });
        }
    }
    for file in &manifest.derived_caches {
        validate_manifest_file(file, "derived/")?;
        if file.kind != "derived" {
            return Err(PackageError::InvalidPackage {
                message: format!("“{}” is not a derived-PDF cache.", file.file),
            });
        }
    }

    let mut names = HashSet::new();
    let all = manifest
        .documents
        .iter()
        .chain(manifest.exports.iter())
        .chain(manifest.source_scans.iter())
        .chain(manifest.derived_caches.iter());
    let mut total = 0_u64;
    for file in all {
        if !names.insert(file.file.to_lowercase()) {
            return Err(PackageError::InvalidPackage {
                message: format!("The package contains “{}” more than once.", file.file),
            });
        }
        total = total.saturating_add(file.size_bytes);
        if total > MAX_TOTAL_BYTES {
            return Err(PackageError::InvalidPackage {
                message: format!(
                    "The package is larger than the {} MiB extraction limit.",
                    MAX_TOTAL_BYTES / (1024 * 1024)
                ),
            });
        }
    }
    if names.contains(&manifest.project_file.to_lowercase())
        || names.contains("manifest.json")
        || names.contains("readme.txt")
    {
        return Err(PackageError::InvalidPackage {
            message: "The package manifest reuses a reserved file name.".to_string(),
        });
    }
    Ok(())
}

pub(crate) fn readme_text(manifest: &PackageManifest) -> String {
    format!(
        "GridScalr project package\r\n\
         =========================\r\n\
         \r\n\
         Package format: {PACKAGE_FORMAT} version {PACKAGE_FORMAT_VERSION}\r\n\
         Project file:   {project}\r\n\
         Project schema: {schema}\r\n\
         Created by:     GridScalr {app}\r\n\
         \r\n\
         Opening the package\r\n\
         -------------------\r\n\
         In GridScalr, choose File -> Open package... and select this ZIP file.\r\n\
         GridScalr extracts it, verifies every checksum and opens the project.\r\n\
         \r\n\
         Manual extraction\r\n\
         -----------------\r\n\
         Unzip this file and open {project} with File -> Open project... .\r\n\
         Keep the documents/ folder next to the project file so the relative\r\n\
         drawing links resolve.\r\n\
         \r\n\
         Contents\r\n\
         --------\r\n\
         manifest.json      package version, file list, sizes and SHA-256 checksums\r\n\
         {project:<18}the project file\r\n\
         documents/         referenced PDF drawings\r\n\
         exports/           optional reports and drawing exports\r\n\
         source-scans/      optional original TIF scans\r\n\
         derived/           rebuilt PDF caches for colour scans\r\n\
         \r\n\
         A TIF scan is carried either as its derived PDF cache (derived/) or as\r\n\
         its original scan (source-scans/), never both.\r\n\
         \r\n\
         Checksums detect corruption and accidental changes. This package is not\r\n\
         encrypted and is not cryptographically signed.\r\n",
        project = manifest.project_file,
        schema = manifest.project_schema,
        app = manifest.app_version,
    )
}

#[cfg(test)]
mod tests;
