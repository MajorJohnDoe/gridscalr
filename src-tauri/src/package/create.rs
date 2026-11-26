//! Package creation: validate the request, stream every entry into a temporary
//! sibling ZIP, verify the manifest and atomically replace the output.
//!
//! Both size checks run before the temporary file exists: an output that no
//! extraction would accept, or that cannot fit the destination volume, must not
//! write a package and then fail part-way through (F-044).

use std::fs::{self, File};
use std::io::BufWriter;
use std::path::Path;
use std::sync::atomic::AtomicBool;

use tauri::ipc::Channel;
use zip::{CompressionMethod, ZipWriter};

use crate::commands::{replace_file, unique_sibling};
use crate::disk_space;
use crate::package_limits::ensure_output_fits;

use super::error::{ChecksumMismatch, PackageError};
use super::hash::hash_bytes;
use super::jobs::{check_cancelled, finish_job, register_job};
use super::limits::{MAX_TOTAL_BYTES, PACKAGE_FORMAT, PACKAGE_FORMAT_VERSION};
use super::manifest::{readme_text, validate_manifest};
use super::names::display_name;
use super::progress::Progress;
use super::request::validate_request;
use super::types::{CreateResult, PackageManifest, PackageProgress, PackageRequest};
use super::write::{write_addition, write_source, write_zip_bytes};

/// Probe for the free space of the volume that will hold an output. A function
/// pointer keeps the pre-write limit testable without a nearly full disk.
type SpaceProbe = fn(&Path) -> Option<u64>;

pub(crate) fn create_package(
    request: &PackageRequest,
    channel: Option<Channel<PackageProgress>>,
    cancelled: &AtomicBool,
) -> Result<CreateResult, PackageError> {
    create_package_with(
        request,
        channel,
        cancelled,
        MAX_TOTAL_BYTES,
        disk_space::available_bytes_at,
    )
}

fn create_package_with(
    request: &PackageRequest,
    channel: Option<Channel<PackageProgress>>,
    cancelled: &AtomicBool,
    max_bytes: u64,
    space: SpaceProbe,
) -> Result<CreateResult, PackageError> {
    check_cancelled(cancelled)?;
    let source_sizes = validate_request(request)?;

    let project_hash = hash_bytes(request.project_json.as_bytes());
    let mut manifest = PackageManifest {
        format: PACKAGE_FORMAT.to_string(),
        format_version: PACKAGE_FORMAT_VERSION,
        created_at: request.created_at.clone(),
        app_version: request.app_version.clone(),
        project_file: request.project_file_name.clone(),
        project_sha256: project_hash,
        project_schema: request.project_schema,
        documents: Vec::new(),
        exports: Vec::new(),
        source_scans: Vec::new(),
        derived_caches: Vec::new(),
    };
    let readme = readme_text(&manifest);
    let addition_sizes: Vec<u64> = request
        .exports
        .iter()
        .map(|entry| (entry.data_base64.len() as u64 / 4) * 3)
        .collect();
    let content_bytes = request.project_json.len() as u64
        + readme.len() as u64
        + source_sizes.iter().sum::<u64>()
        + addition_sizes.iter().sum::<u64>();
    let total_bytes = content_bytes.saturating_add(4096);

    let output = Path::new(&request.output_path);
    let parent = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    // Both checks run before the temporary file exists: an output that no
    // extraction would accept, or that cannot fit the destination volume, must
    // not write a package and then fail part-way through (F-044).
    ensure_output_fits(content_bytes, max_bytes, space(parent))?;
    fs::create_dir_all(parent)?;
    let temp = unique_sibling(output, "tmp");
    let file = File::create(&temp)?;
    let writer = BufWriter::new(file);
    let mut zip = ZipWriter::new(writer);
    let mut progress = Progress::new(channel, "Writing package", total_bytes);

    let result = (|| -> Result<(), PackageError> {
        write_zip_bytes(
            &mut zip,
            "README.txt",
            readme.as_bytes(),
            CompressionMethod::Deflated,
            &mut progress,
            cancelled,
        )?;

        progress.start_file(&request.project_file_name);
        write_zip_bytes(
            &mut zip,
            &request.project_file_name,
            request.project_json.as_bytes(),
            CompressionMethod::Deflated,
            &mut progress,
            cancelled,
        )?;

        let mut mismatches = Vec::new();
        for source in &request.documents {
            let entry = write_source(
                &mut zip,
                source,
                CompressionMethod::Stored,
                &mut progress,
                cancelled,
            )?;
            if !source.expected_sha256.is_empty() && source.expected_sha256 != entry.sha256 {
                mismatches.push(ChecksumMismatch {
                    file: entry.file.clone(),
                    name: display_name(&source.source_path),
                    expected: source.expected_sha256.clone(),
                    actual: entry.sha256.clone(),
                    size_bytes: entry.size_bytes,
                });
            }
            manifest.documents.push(entry);
        }
        if !mismatches.is_empty() {
            return Err(PackageError::ChecksumMismatch { files: mismatches });
        }

        for (addition, estimated) in request.exports.iter().zip(addition_sizes.iter()) {
            let entry = write_addition(&mut zip, addition, *estimated, &mut progress, cancelled)?;
            manifest.exports.push(entry);
        }

        for scan in &request.source_scans {
            let entry = write_source(
                &mut zip,
                scan,
                CompressionMethod::Stored,
                &mut progress,
                cancelled,
            )?;
            if !scan.expected_sha256.is_empty() && scan.expected_sha256 != entry.sha256 {
                mismatches.push(ChecksumMismatch {
                    file: entry.file.clone(),
                    name: display_name(&scan.source_path),
                    expected: scan.expected_sha256.clone(),
                    actual: entry.sha256.clone(),
                    size_bytes: entry.size_bytes,
                });
            }
            manifest.source_scans.push(entry);
        }
        if !mismatches.is_empty() {
            return Err(PackageError::ChecksumMismatch { files: mismatches });
        }

        for cache in &request.derived_caches {
            let entry = write_source(
                &mut zip,
                cache,
                CompressionMethod::Stored,
                &mut progress,
                cancelled,
            )?;
            if !cache.expected_sha256.is_empty() && cache.expected_sha256 != entry.sha256 {
                mismatches.push(ChecksumMismatch {
                    file: entry.file.clone(),
                    name: display_name(&cache.source_path),
                    expected: cache.expected_sha256.clone(),
                    actual: entry.sha256.clone(),
                    size_bytes: entry.size_bytes,
                });
            }
            manifest.derived_caches.push(entry);
        }
        if !mismatches.is_empty() {
            return Err(PackageError::ChecksumMismatch { files: mismatches });
        }

        let written_total = request.project_json.len() as u64
            + readme.len() as u64
            + manifest
                .documents
                .iter()
                .chain(manifest.exports.iter())
                .chain(manifest.source_scans.iter())
                .chain(manifest.derived_caches.iter())
                .map(|file| file.size_bytes)
                .sum::<u64>();
        if written_total > MAX_TOTAL_BYTES {
            return Err(PackageError::InvalidPackage {
                message: "The project grew beyond the package limit while it was written."
                    .to_string(),
            });
        }
        validate_manifest(&manifest)?;
        let manifest_json = serde_json::to_string_pretty(&manifest)?;
        progress.start_file("manifest.json");
        write_zip_bytes(
            &mut zip,
            "manifest.json",
            manifest_json.as_bytes(),
            CompressionMethod::Deflated,
            &mut progress,
            cancelled,
        )?;
        Ok(())
    })();

    if let Err(error) = result {
        let _ = zip.finish();
        let _ = fs::remove_file(&temp);
        return Err(error);
    }

    let writer = zip.finish()?;
    let file = writer.into_inner().map_err(|error| PackageError::Io {
        message: error.to_string(),
    })?;
    file.sync_all()?;
    let manifest_json = serde_json::to_string_pretty(&manifest)?;
    replace_file(
        &temp,
        output,
        &output
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "package".to_string()),
    )?;
    progress.finish();

    Ok(CreateResult {
        output_path: request.output_path.clone(),
        manifest,
        manifest_json,
        total_bytes,
    })
}

#[tauri::command]
pub async fn package_create(
    request: PackageRequest,
    on_progress: Channel<PackageProgress>,
) -> Result<CreateResult, PackageError> {
    let job_id = request.job_id.clone();
    let flag = register_job(&job_id);
    let result = tauri::async_runtime::spawn_blocking(move || {
        create_package(&request, Some(on_progress), flag.as_ref())
    })
    .await;
    finish_job(&job_id);
    match result {
        Ok(result) => result,
        Err(error) => Err(PackageError::Io {
            message: format!("The package task failed: {error}"),
        }),
    }
}

#[cfg(test)]
mod tests;
