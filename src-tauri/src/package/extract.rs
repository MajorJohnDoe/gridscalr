//! Package extraction: stage into a sibling folder, verify every checksum, then
//! move the staged folder into place.
//!
//! A failed or cancelled extraction removes its staging folder and leaves the
//! destination untouched. A replaced destination is restored if the final rename
//! fails, so a user never loses the folder they replaced.

use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use sha2::{Digest, Sha256};
use tauri::ipc::Channel;
use zip::ZipArchive;

use crate::commands::sync_directory;
use crate::disk_space;
use crate::temp_cleanup::clean_extraction_temporaries;

use super::error::{ChecksumMismatch, PackageError};
use super::hash::hex_digest;
use super::inspect::inspect_archive;
use super::jobs::{check_cancelled, finish_job, register_job};
use super::limits::{CHUNK_BYTES, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES};
use super::names::{path_string, project_stem, sanitize_folder, validate_entry_name};
use super::progress::Progress;
use super::temp::{extraction_folder, previous_folder, TempDirectory};
use super::types::{ExtractRequest, ExtractResult, PackageManifest, PackageProgress};

fn default_destination(package_path: &Path, manifest: &PackageManifest) -> PathBuf {
    let parent = package_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    parent.join(sanitize_folder(&project_stem(&manifest.project_file)))
}

/// Refuses an extraction that cannot fit in the destination volume. A missing
/// free-space figure (an unusual file system) keeps the explicit byte cap.
fn ensure_free_space(available: Option<u64>, total: u64) -> Result<(), PackageError> {
    let required = disk_space::required_bytes(total);
    match available {
        Some(available) if available < required => Err(PackageError::InsufficientSpace {
            required_bytes: required,
            available_bytes: available,
        }),
        _ => Ok(()),
    }
}

fn verify_existing_folder(
    destination: &Path,
    manifest: &PackageManifest,
) -> Result<(), PackageError> {
    let existing_manifest = destination.join("manifest.json");
    let text =
        fs::read_to_string(&existing_manifest).map_err(|_| PackageError::InvalidPackage {
            message: "The destination folder is not an extracted GridScalr package.".to_string(),
        })?;
    let existing: PackageManifest = serde_json::from_str(&text)?;
    if existing.format != manifest.format
        || existing.format_version != manifest.format_version
        || existing.project_file != manifest.project_file
    {
        return Err(PackageError::InvalidPackage {
            message: "The destination folder contains a different GridScalr package.".to_string(),
        });
    }
    // The extracted copy may have been edited, so its project checksum no longer
    // has to match the package. The project must still exist and be JSON.
    let project_path = destination.join(&manifest.project_file);
    let project_text =
        fs::read_to_string(&project_path).map_err(|_| PackageError::InvalidPackage {
            message: format!(
                "The existing folder is missing “{}”.",
                manifest.project_file
            ),
        })?;
    let project: serde_json::Value =
        serde_json::from_str(&project_text).map_err(|error| PackageError::InvalidPackage {
            message: format!("The existing project is not valid JSON: {error}"),
        })?;
    if !project
        .get("documents")
        .map(|value| value.is_array())
        .unwrap_or(false)
    {
        return Err(PackageError::InvalidPackage {
            message: "The existing project has no documents list.".to_string(),
        });
    }
    Ok(())
}

pub(crate) fn extract_package(
    request: &ExtractRequest,
    channel: Option<Channel<PackageProgress>>,
    cancelled: &AtomicBool,
) -> Result<ExtractResult, PackageError> {
    let package_path = Path::new(&request.package_path);
    let (manifest, manifest_json, entries) = inspect_archive(package_path)?;
    let destination = if request.destination_path.trim().is_empty() {
        default_destination(package_path, &manifest)
    } else {
        PathBuf::from(&request.destination_path)
    };
    if destination.as_os_str().is_empty() {
        return Err(PackageError::InvalidPackage {
            message: "Choose a folder for the extracted project.".to_string(),
        });
    }

    match request.mode.as_str() {
        "reuse" => {
            verify_existing_folder(&destination, &manifest)?;
            return Ok(ExtractResult {
                project_path: path_string(&destination.join(&manifest.project_file)),
                manifest,
                manifest_json,
                extracted_to: path_string(&destination),
            });
        }
        "new" | "replace" => {}
        other => {
            return Err(PackageError::InvalidPackage {
                message: format!("Unknown extraction mode: {other}."),
            });
        }
    }

    if destination.exists() {
        if request.mode == "new" {
            return Err(PackageError::DestinationExists {
                path: path_string(&destination),
            });
        }
        let empty = destination
            .read_dir()
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
        if !destination.is_dir() || (!empty && !destination.join("manifest.json").is_file()) {
            return Err(PackageError::InvalidPackage {
                message: "The destination folder is not empty and is not an extracted GridScalr package. Choose another folder.".to_string(),
            });
        }
    }

    let parent = destination
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let total_bytes = entries.iter().map(|entry| entry.size).sum::<u64>();
    ensure_free_space(disk_space::available_bytes(parent), total_bytes)?;
    // A crashed or cancelled earlier extraction can leave its staging folder
    // behind; opening a package removes the stale ones under the same age and
    // process guard as a save sibling (F-046).
    clean_extraction_temporaries(parent);
    let temp_dir = extraction_folder(parent, &destination);
    fs::create_dir_all(&temp_dir)?;
    let temp = TempDirectory {
        path: temp_dir.clone(),
        keep: false,
    };

    let mut progress = Progress::new(channel, "Extracting package", total_bytes);
    let mut extracted_total = 0_u64;
    let result = (|| -> Result<(), PackageError> {
        let file = File::open(package_path)?;
        let mut archive = ZipArchive::new(BufReader::new(file))?;
        for entry in &entries {
            check_cancelled(cancelled)?;
            // Defence in depth: the name was validated during inspection, and
            // it is validated again before a single byte is written.
            validate_entry_name(&entry.name)?;
            let mut archive_entry = archive.by_name(&entry.name)?;
            if archive_entry.encrypted() || archive_entry.is_symlink() {
                return Err(PackageError::InvalidPackage {
                    message: format!("The package contains an unsafe entry: “{}”.", entry.name),
                });
            }
            let output = temp_dir.join(&entry.name);
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent)?;
            }
            progress.start_file(&entry.name);
            let mut writer = BufWriter::new(File::create(&output)?);
            let mut hasher = Sha256::new();
            let mut buffer = vec![0_u8; CHUNK_BYTES];
            let mut written = 0_u64;
            loop {
                check_cancelled(cancelled)?;
                let read = archive_entry.read(&mut buffer)?;
                if read == 0 {
                    break;
                }
                written = written.saturating_add(read as u64);
                extracted_total = extracted_total.saturating_add(read as u64);
                if written > MAX_ENTRY_BYTES || extracted_total > MAX_TOTAL_BYTES {
                    return Err(PackageError::InvalidPackage {
                        message: format!("“{}” is larger than the package limit.", entry.name),
                    });
                }
                hasher.update(&buffer[..read]);
                writer.write_all(&buffer[..read])?;
                progress.add(read as u64);
            }
            let output_file = writer.into_inner().map_err(|error| PackageError::Io {
                message: error.to_string(),
            })?;
            output_file.sync_all()?;
            let actual = hex_digest(&hasher.finalize());
            if entry.name.eq_ignore_ascii_case("manifest.json")
                || entry.name.eq_ignore_ascii_case("README.txt")
            {
                continue;
            }
            let expected = if entry.name == manifest.project_file {
                &manifest.project_sha256
            } else {
                let file = manifest
                    .documents
                    .iter()
                    .chain(manifest.exports.iter())
                    .chain(manifest.source_scans.iter())
                    .chain(manifest.derived_caches.iter())
                    .find(|file| file.file == entry.name)
                    .ok_or_else(|| PackageError::InvalidPackage {
                        message: format!(
                            "The package contains an unexpected file: “{}”.",
                            entry.name
                        ),
                    })?;
                if written != file.size_bytes {
                    return Err(PackageError::InvalidPackage {
                        message: format!("“{}” has the wrong size.", entry.name),
                    });
                }
                &file.sha256
            };
            if &actual != expected {
                return Err(PackageError::ChecksumMismatch {
                    files: vec![ChecksumMismatch {
                        file: entry.name.clone(),
                        name: entry.name.clone(),
                        expected: expected.clone(),
                        actual,
                        size_bytes: written,
                    }],
                });
            }
        }
        Ok(())
    })();

    if let Err(error) = result {
        drop(temp);
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(error);
    }
    if let Err(error) =
        super::project::validate_extracted_project(&temp_dir.join(&manifest.project_file))
    {
        drop(temp);
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(error);
    }

    let backup = if destination.exists() {
        let backup = previous_folder(parent, &destination);
        fs::rename(&destination, &backup)?;
        Some(backup)
    } else {
        None
    };

    if let Err(error) = fs::rename(&temp_dir, &destination) {
        if let Some(backup) = &backup {
            let _ = fs::rename(backup, &destination);
        }
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(PackageError::Io {
            message: format!(
                "Could not move the extracted project into place. The previous folder was restored: {error}"
            ),
        });
    }
    let mut temp = temp;
    temp.keep = true;
    if let Some(backup) = backup {
        let _ = fs::remove_dir_all(backup);
    }
    sync_directory(parent);
    progress.finish();

    Ok(ExtractResult {
        project_path: path_string(&destination.join(&manifest.project_file)),
        manifest,
        manifest_json,
        extracted_to: path_string(&destination),
    })
}

#[tauri::command]
pub async fn package_extract(
    request: ExtractRequest,
    on_progress: Channel<PackageProgress>,
) -> Result<ExtractResult, PackageError> {
    let job_id = request.job_id.clone();
    let flag = register_job(&job_id);
    let result = tauri::async_runtime::spawn_blocking(move || {
        extract_package(&request, Some(on_progress), flag.as_ref())
    })
    .await;
    finish_job(&job_id);
    match result {
        Ok(result) => result,
        Err(error) => Err(PackageError::Io {
            message: format!("The extraction task failed: {error}"),
        }),
    }
}

#[cfg(test)]
mod tests;
