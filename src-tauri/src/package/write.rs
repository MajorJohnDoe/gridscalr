//! ZIP writers for one package entry.
//!
//! Source drawings and scans are streamed and hashed in one pass; exports arrive
//! as base64 and are written from memory. Both paths report progress and poll the
//! cancellation flag between chunks.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::sync::atomic::AtomicBool;

use base64::Engine;
use sha2::{Digest, Sha256};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use super::error::{MissingFile, PackageError};
use super::hash::{hash_bytes, hex_digest};
use super::jobs::check_cancelled;
use super::limits::{CHUNK_BYTES, MAX_ENTRY_BYTES};
use super::progress::Progress;
use super::types::{ManifestFile, PackageData, PackageSource};

pub(crate) fn write_zip_bytes(
    zip: &mut ZipWriter<BufWriter<File>>,
    name: &str,
    data: &[u8],
    method: CompressionMethod,
    progress: &mut Progress,
    cancelled: &AtomicBool,
) -> Result<(), PackageError> {
    check_cancelled(cancelled)?;
    zip.start_file(
        name,
        SimpleFileOptions::default()
            .compression_method(method)
            .unix_permissions(0o644),
    )?;
    progress.start_file(name);
    zip.write_all(data)?;
    progress.add(data.len() as u64);
    Ok(())
}

pub(crate) fn write_source(
    zip: &mut ZipWriter<BufWriter<File>>,
    source: &PackageSource,
    method: CompressionMethod,
    progress: &mut Progress,
    cancelled: &AtomicBool,
) -> Result<ManifestFile, PackageError> {
    check_cancelled(cancelled)?;
    let file = File::open(&source.source_path).map_err(|_| PackageError::MissingSource {
        files: vec![MissingFile {
            name: source
                .source_path
                .rsplit(['/', '\\'])
                .next()
                .unwrap_or(&source.source_path)
                .to_string(),
            path: source.source_path.clone(),
        }],
    })?;
    let metadata = file.metadata()?;
    if metadata.len() > MAX_ENTRY_BYTES {
        return Err(PackageError::InvalidPackage {
            message: format!(
                "“{}” is larger than the package limit.",
                source.archive_path
            ),
        });
    }
    zip.start_file(
        &source.archive_path,
        SimpleFileOptions::default()
            .compression_method(method)
            .unix_permissions(0o644),
    )?;
    progress.start_file(&source.archive_path);
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; CHUNK_BYTES];
    let mut written = 0_u64;
    loop {
        check_cancelled(cancelled)?;
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        written = written.saturating_add(read as u64);
        if written > MAX_ENTRY_BYTES {
            return Err(PackageError::InvalidPackage {
                message: format!(
                    "“{}” is larger than the package limit.",
                    source.archive_path
                ),
            });
        }
        hasher.update(&buffer[..read]);
        zip.write_all(&buffer[..read])?;
        progress.add(read as u64);
    }
    Ok(manifest_entry(
        &source.archive_path,
        hex_digest(&hasher.finalize()),
        written,
        &source.kind,
    ))
}

pub(crate) fn write_addition(
    zip: &mut ZipWriter<BufWriter<File>>,
    addition: &PackageData,
    estimated_bytes: u64,
    progress: &mut Progress,
    cancelled: &AtomicBool,
) -> Result<ManifestFile, PackageError> {
    check_cancelled(cancelled)?;
    if estimated_bytes > MAX_ENTRY_BYTES {
        return Err(PackageError::InvalidPackage {
            message: format!(
                "“{}” is larger than the package limit.",
                addition.archive_path
            ),
        });
    }
    let data = base64::engine::general_purpose::STANDARD
        .decode(addition.data_base64.as_bytes())
        .map_err(|error| PackageError::InvalidPackage {
            message: format!(
                "“{}” has an invalid binary payload: {error}",
                addition.archive_path
            ),
        })?;
    if data.len() as u64 > MAX_ENTRY_BYTES {
        return Err(PackageError::InvalidPackage {
            message: format!(
                "“{}” is larger than the package limit.",
                addition.archive_path
            ),
        });
    }
    let method = if addition.archive_path.ends_with(".csv")
        || addition.archive_path.ends_with(".json")
        || addition.archive_path.ends_with(".txt")
    {
        CompressionMethod::Deflated
    } else {
        CompressionMethod::Stored
    };
    zip.start_file(
        &addition.archive_path,
        SimpleFileOptions::default()
            .compression_method(method)
            .unix_permissions(0o644),
    )?;
    progress.start_file(&addition.archive_path);
    zip.write_all(&data)?;
    progress.add(data.len() as u64);
    Ok(manifest_entry(
        &addition.archive_path,
        hash_bytes(&data),
        data.len() as u64,
        &addition.kind,
    ))
}

pub(crate) fn manifest_entry(
    file: &str,
    sha256: String,
    size_bytes: u64,
    kind: &str,
) -> ManifestFile {
    ManifestFile {
        file: file.to_string(),
        sha256,
        size_bytes,
        kind: kind.to_string(),
    }
}
