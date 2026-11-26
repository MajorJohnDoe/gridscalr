//! Archive inspection: bounded entry scan, one manifest read, cross-checks
//! against the file list, and the destination preview.
//!
//! Inspection runs before extraction and never writes anything.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::Path;

use zip::ZipArchive;

use super::error::PackageError;
use super::limits::{
    MAX_COMPRESSION_RATIO, MAX_ENTRIES, MAX_ENTRY_BYTES, MAX_MANIFEST_BYTES, MAX_PACKAGE_BYTES,
    MAX_TOTAL_BYTES,
};
use super::manifest::validate_manifest;
use super::names::{path_string, project_stem, sanitize_folder, validate_entry_name};
use super::types::{InspectionResult, PackageManifest};

pub(crate) struct ArchiveEntry {
    pub(crate) name: String,
    pub(crate) size: u64,
}

pub(crate) fn inspect_archive(
    path: &Path,
) -> Result<(PackageManifest, String, Vec<ArchiveEntry>), PackageError> {
    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_PACKAGE_BYTES {
        return Err(PackageError::InvalidPackage {
            message: format!(
                "The package file is larger than the {} MiB limit.",
                MAX_PACKAGE_BYTES / (1024 * 1024)
            ),
        });
    }
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(BufReader::new(file))?;
    if archive.len() > MAX_ENTRIES {
        return Err(PackageError::InvalidPackage {
            message: format!("The package contains more than {MAX_ENTRIES} files."),
        });
    }

    let mut entries = Vec::new();
    let mut names = HashSet::new();
    let mut manifest_index = None;
    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let entry = archive.by_index_raw(index)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name()?.to_string();
        validate_entry_name(&name)?;
        if entry.is_symlink() {
            return Err(PackageError::InvalidPackage {
                message: format!("The package contains a symbolic link: “{name}”."),
            });
        }
        if entry.encrypted() {
            return Err(PackageError::InvalidPackage {
                message: "Encrypted packages are not supported.".to_string(),
            });
        }
        if !names.insert(name.to_lowercase()) {
            return Err(PackageError::InvalidPackage {
                message: format!("The package contains “{name}” more than once."),
            });
        }
        if entry.size() > MAX_ENTRY_BYTES {
            return Err(PackageError::InvalidPackage {
                message: format!("“{name}” is larger than the package limit."),
            });
        }
        total_size = total_size.saturating_add(entry.size());
        if total_size > MAX_TOTAL_BYTES {
            return Err(PackageError::InvalidPackage {
                message: "The package is larger than the extraction limit.".to_string(),
            });
        }
        if entry.size() > 16 * 1024 * 1024
            && entry.compressed_size() > 0
            && entry.size() / entry.compressed_size() > MAX_COMPRESSION_RATIO
        {
            return Err(PackageError::InvalidPackage {
                message: format!(
                    "“{name}” is compressed too aggressively to be a project package."
                ),
            });
        }
        if name.eq_ignore_ascii_case("manifest.json") {
            if manifest_index.is_some() {
                return Err(PackageError::InvalidPackage {
                    message: "The package contains more than one manifest.json.".to_string(),
                });
            }
            manifest_index = Some(index);
        }
        entries.push(ArchiveEntry {
            name,
            size: entry.size(),
        });
    }

    let Some(manifest_index) = manifest_index else {
        return Err(PackageError::InvalidPackage {
            message: "The package has no manifest.json.".to_string(),
        });
    };
    let manifest_json = {
        let mut entry = archive.by_index(manifest_index)?;
        if entry.size() > MAX_MANIFEST_BYTES || entry.encrypted() {
            return Err(PackageError::InvalidPackage {
                message: "The package manifest is too large or encrypted.".to_string(),
            });
        }
        let mut bytes = Vec::new();
        entry
            .by_ref()
            .take(MAX_MANIFEST_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_MANIFEST_BYTES {
            return Err(PackageError::InvalidPackage {
                message: "The package manifest is too large.".to_string(),
            });
        }
        String::from_utf8(bytes).map_err(|_| PackageError::InvalidPackage {
            message: "The package manifest is not UTF-8.".to_string(),
        })?
    };
    let manifest: PackageManifest = serde_json::from_str(&manifest_json)?;
    validate_manifest(&manifest)?;

    let mut expected: HashSet<String> = HashSet::new();
    expected.insert(manifest.project_file.to_lowercase());
    expected.insert("manifest.json".to_string());
    expected.insert("readme.txt".to_string());
    for file in manifest
        .documents
        .iter()
        .chain(manifest.exports.iter())
        .chain(manifest.source_scans.iter())
        .chain(manifest.derived_caches.iter())
    {
        expected.insert(file.file.to_lowercase());
    }
    for entry in &entries {
        if !expected.contains(&entry.name.to_lowercase()) {
            return Err(PackageError::InvalidPackage {
                message: format!("The package contains an unexpected file: “{}”.", entry.name),
            });
        }
    }
    for name in &expected {
        if !names.contains(name) {
            return Err(PackageError::InvalidPackage {
                message: format!("The package is missing “{name}”."),
            });
        }
    }
    Ok((manifest, manifest_json, entries))
}

pub(crate) fn inspect_package(path: &Path) -> Result<InspectionResult, PackageError> {
    let (manifest, manifest_json, entries) = inspect_archive(path)?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let project_name = sanitize_folder(&project_stem(&manifest.project_file));
    let destination = parent.join(&project_name);
    Ok(InspectionResult {
        manifest,
        manifest_json,
        destination_exists: destination.exists(),
        destination_path: path_string(&destination),
        project_name,
        uncompressed_bytes: entries.iter().map(|entry| entry.size).sum(),
    })
}

#[tauri::command]
pub fn package_inspect(package_path: String) -> Result<InspectionResult, PackageError> {
    inspect_package(Path::new(&package_path))
}

#[cfg(test)]
mod tests;
