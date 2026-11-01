use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::commands::{ensure_writable, replace_file, sync_directory, unique_sibling};

pub const PACKAGE_FORMAT: &str = "gridscalr-package";
pub const PACKAGE_FORMAT_VERSION: u32 = 1;
pub const MAX_ENTRIES: usize = 4096;
pub const MAX_ENTRY_BYTES: u64 = 4 * 1024 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: u64 = 16 * 1024 * 1024 * 1024;
pub const MAX_MANIFEST_BYTES: u64 = 2 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 200;
const CHUNK_BYTES: usize = 64 * 1024;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(60);

static JOBS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn jobs() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_job(job_id: &str) -> Arc<AtomicBool> {
    let mut registry = jobs().lock().expect("package job registry poisoned");
    registry
        .entry(job_id.to_string())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .clone()
}

fn finish_job(job_id: &str) {
    if let Ok(mut registry) = jobs().lock() {
        registry.remove(job_id);
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PackageError {
    Cancelled,
    MissingSource { files: Vec<MissingFile> },
    ChecksumMismatch { files: Vec<ChecksumMismatch> },
    DestinationExists { path: String },
    InvalidPackage { message: String },
    Io { message: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingFile {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumMismatch {
    pub file: String,
    pub name: String,
    pub expected: String,
    pub actual: String,
    pub size_bytes: u64,
}

impl From<std::io::Error> for PackageError {
    fn from(error: std::io::Error) -> Self {
        PackageError::Io {
            message: error.to_string(),
        }
    }
}

impl From<zip::result::ZipError> for PackageError {
    fn from(error: zip::result::ZipError) -> Self {
        PackageError::InvalidPackage {
            message: error.to_string(),
        }
    }
}

impl From<serde_json::Error> for PackageError {
    fn from(error: serde_json::Error) -> Self {
        PackageError::InvalidPackage {
            message: format!("The package manifest is not valid JSON: {error}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFile {
    pub file: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageManifest {
    pub format: String,
    pub format_version: u32,
    pub created_at: String,
    pub app_version: String,
    pub project_file: String,
    pub project_sha256: String,
    pub project_schema: u32,
    #[serde(default)]
    pub documents: Vec<ManifestFile>,
    #[serde(default)]
    pub exports: Vec<ManifestFile>,
    #[serde(default)]
    pub source_scans: Vec<ManifestFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageSource {
    pub source_path: String,
    pub archive_path: String,
    pub kind: String,
    #[serde(default)]
    pub expected_sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageData {
    pub archive_path: String,
    pub kind: String,
    pub data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageRequest {
    pub job_id: String,
    pub output_path: String,
    pub project_file_name: String,
    pub project_json: String,
    pub project_schema: u32,
    pub app_version: String,
    pub created_at: String,
    pub documents: Vec<PackageSource>,
    pub exports: Vec<PackageData>,
    pub source_scans: Vec<PackageSource>,
    #[serde(default)]
    pub protected_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractRequest {
    pub job_id: String,
    pub package_path: String,
    pub destination_path: String,
    /// `new`, `replace` or `reuse`.
    pub mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageProgress {
    pub phase: String,
    pub processed_bytes: u64,
    pub total_bytes: u64,
    pub current_file: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResult {
    pub output_path: String,
    pub manifest: PackageManifest,
    pub manifest_json: String,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectionResult {
    pub manifest: PackageManifest,
    pub manifest_json: String,
    pub destination_path: String,
    pub destination_exists: bool,
    pub project_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub project_path: String,
    pub manifest: PackageManifest,
    pub manifest_json: String,
    pub extracted_to: String,
}

struct Progress {
    channel: Option<Channel<PackageProgress>>,
    phase: String,
    processed: u64,
    total: u64,
    current: String,
    last_emit: Instant,
}

impl Progress {
    fn new(channel: Option<Channel<PackageProgress>>, phase: &str, total: u64) -> Self {
        let mut progress = Self {
            channel,
            phase: phase.to_string(),
            processed: 0,
            total,
            current: String::new(),
            last_emit: Instant::now(),
        };
        progress.send(true);
        progress
    }

    fn start_file(&mut self, file: &str) {
        self.current = file.to_string();
        self.send(true);
    }

    fn add(&mut self, bytes: u64) {
        self.processed = self.processed.saturating_add(bytes);
        if self.last_emit.elapsed() >= PROGRESS_INTERVAL {
            self.send(false);
        }
    }

    fn finish(&mut self) {
        self.processed = self.total;
        self.send(true);
    }

    fn send(&mut self, force: bool) {
        if !force && self.last_emit.elapsed() < PROGRESS_INTERVAL {
            return;
        }
        self.last_emit = Instant::now();
        if let Some(channel) = &self.channel {
            let _ = channel.send(PackageProgress {
                phase: self.phase.clone(),
                processed_bytes: self.processed.min(self.total),
                total_bytes: self.total,
                current_file: self.current.clone(),
            });
        }
    }
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), PackageError> {
    if cancelled.load(Ordering::SeqCst) {
        Err(PackageError::Cancelled)
    } else {
        Ok(())
    }
}

fn is_hex_sha256(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

fn validate_manifest_file(file: &ManifestFile, prefix: &str) -> Result<(), PackageError> {
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

    let mut names = HashSet::new();
    let all = manifest
        .documents
        .iter()
        .chain(manifest.exports.iter())
        .chain(manifest.source_scans.iter());
    for file in all {
        if !names.insert(file.file.to_lowercase()) {
            return Err(PackageError::InvalidPackage {
                message: format!("The package contains “{}” more than once.", file.file),
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

fn validate_entry_name(name: &str) -> Result<(), PackageError> {
    if name.is_empty() || name.len() > 240 {
        return Err(PackageError::InvalidPackage {
            message: "The package contains an empty or too long file name.".to_string(),
        });
    }
    if name.contains(['\\', '\0', ':']) || name.starts_with('/') {
        return Err(PackageError::InvalidPackage {
            message: format!("The package contains an unsafe file name: “{name}”."),
        });
    }
    let path = Path::new(name);
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(PackageError::InvalidPackage {
            message: format!("The package contains a path outside its root: “{name}”."),
        });
    }
    if name
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(PackageError::InvalidPackage {
            message: format!("The package contains an unsafe file name: “{name}”."),
        });
    }
    Ok(())
}

fn validate_archive_name(name: &str, prefix: Option<&str>) -> Result<(), PackageError> {
    validate_entry_name(name)?;
    if let Some(prefix) = prefix {
        let Some(rest) = name.strip_prefix(prefix) else {
            return Err(PackageError::InvalidPackage {
                message: format!("“{name}” is outside {prefix}."),
            });
        };
        if rest.is_empty() || rest.contains('/') {
            return Err(PackageError::InvalidPackage {
                message: format!("“{name}” is not a file inside {prefix}."),
            });
        }
    } else if name.contains('/') {
        return Err(PackageError::InvalidPackage {
            message: format!("“{name}” is not a top-level package file."),
        });
    }
    Ok(())
}

fn sanitize_folder(name: &str) -> String {
    let mut safe: String = name
        .chars()
        .map(|character| {
            if character.is_control() || "<>:\"/\\|?*".contains(character) {
                '_'
            } else {
                character
            }
        })
        .collect();
    safe = safe.trim().trim_end_matches(['.', ' ']).to_string();
    if safe.is_empty() {
        return "GridScalr package".to_string();
    }
    let reserved = [
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
        "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    if reserved.contains(&safe.to_lowercase().as_str()) {
        format!("_{safe}")
    } else {
        safe
    }
}

fn project_stem(project_file: &str) -> String {
    project_file
        .strip_suffix(".gridscalr")
        .unwrap_or(project_file)
        .to_string()
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn display_name(path: &str) -> String {
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}

fn manifest_entry(file: &str, sha256: String, size_bytes: u64, kind: &str) -> ManifestFile {
    ManifestFile {
        file: file.to_string(),
        sha256,
        size_bytes,
        kind: kind.to_string(),
    }
}

fn readme_text(manifest: &PackageManifest) -> String {
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
         \r\n\
         Checksums detect corruption and accidental changes. This package is not\r\n\
         encrypted and is not cryptographically signed.\r\n",
        project = manifest.project_file,
        schema = manifest.project_schema,
        app = manifest.app_version,
    )
}

fn validate_project_json(json: &str, document_paths: &HashSet<String>) -> Result<(), PackageError> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|error| PackageError::InvalidPackage {
            message: format!("The project file is not valid JSON: {error}"),
        })?;
    let documents = value
        .get("documents")
        .and_then(|value| value.as_array())
        .ok_or_else(|| PackageError::InvalidPackage {
            message: "The project file has no documents list.".to_string(),
        })?;
    for document in documents {
        if document
            .get("path")
            .map(|value| !value.is_null())
            .unwrap_or(false)
        {
            return Err(PackageError::InvalidPackage {
                message: "The packaged project still contains an absolute document path."
                    .to_string(),
            });
        }
        if let Some(relative) = document
            .get("relativePath")
            .and_then(|value| value.as_str())
        {
            if !document_paths.contains(relative) {
                return Err(PackageError::InvalidPackage {
                    message: format!(
                        "The project refers to “{relative}”, which is not in the package."
                    ),
                });
            }
        }
    }
    Ok(())
}

fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

pub(crate) fn create_package(
    request: &PackageRequest,
    channel: Option<Channel<PackageProgress>>,
    cancelled: &AtomicBool,
) -> Result<CreateResult, PackageError> {
    check_cancelled(cancelled)?;
    ensure_writable(&request.output_path, &request.protected_paths)
        .map_err(|message| PackageError::InvalidPackage { message })?;
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
    for source in request.documents.iter().chain(request.source_scans.iter()) {
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
    if content_bytes > MAX_TOTAL_BYTES {
        return Err(PackageError::InvalidPackage {
            message: "The project is too large for a GridScalr package.".to_string(),
        });
    }
    let total_bytes = content_bytes.saturating_add(4096);

    let output = Path::new(&request.output_path);
    let parent = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
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

        let written_total = request.project_json.len() as u64
            + readme.len() as u64
            + manifest
                .documents
                .iter()
                .chain(manifest.exports.iter())
                .chain(manifest.source_scans.iter())
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
    )
    .map_err(|message| PackageError::InvalidPackage { message })?;
    progress.finish();

    Ok(CreateResult {
        output_path: request.output_path.clone(),
        manifest,
        manifest_json,
        total_bytes,
    })
}

fn write_zip_bytes(
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

fn write_source(
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
        format!("{:x}", hasher.finalize()),
        written,
        &source.kind,
    ))
}

fn write_addition(
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

struct ArchiveEntry {
    name: String,
    size: u64,
}

fn inspect_archive(
    path: &Path,
) -> Result<(PackageManifest, String, Vec<ArchiveEntry>), PackageError> {
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
    let (manifest, manifest_json, _) = inspect_archive(path)?;
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
    })
}

fn default_destination(package_path: &Path, manifest: &PackageManifest) -> PathBuf {
    let parent = package_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    parent.join(sanitize_folder(&project_stem(&manifest.project_file)))
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

fn validate_extracted_project(path: &Path) -> Result<(), PackageError> {
    let text = fs::read_to_string(path)?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|error| PackageError::InvalidPackage {
            message: format!("The packaged project is not valid JSON: {error}"),
        })?;
    let documents = value
        .get("documents")
        .and_then(|value| value.as_array())
        .ok_or_else(|| PackageError::InvalidPackage {
            message: "The packaged project has no documents list.".to_string(),
        })?;
    for document in documents {
        if document
            .get("path")
            .map(|value| !value.is_null())
            .unwrap_or(false)
        {
            return Err(PackageError::InvalidPackage {
                message: "The packaged project contains an absolute document path.".to_string(),
            });
        }
        if let Some(relative) = document
            .get("relativePath")
            .and_then(|value| value.as_str())
        {
            validate_archive_name(relative, Some("documents/"))?;
        }
    }
    Ok(())
}

struct TempDirectory {
    path: PathBuf,
    keep: bool,
}

impl Drop for TempDirectory {
    fn drop(&mut self) {
        if !self.keep {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
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
    let temp_name = format!(
        ".{}.extract-{}-{}",
        destination
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "gridscalr".to_string()),
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    );
    let temp_dir = parent.join(temp_name);
    fs::create_dir_all(&temp_dir)?;
    let temp = TempDirectory {
        path: temp_dir.clone(),
        keep: false,
    };

    let total_bytes = entries.iter().map(|entry| entry.size).sum::<u64>();
    let mut progress = Progress::new(channel, "Extracting package", total_bytes);
    let mut extracted_total = 0_u64;
    let result = (|| -> Result<(), PackageError> {
        let file = File::open(package_path)?;
        let mut archive = ZipArchive::new(BufReader::new(file))?;
        for entry in &entries {
            check_cancelled(cancelled)?;
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
            let actual = format!("{:x}", hasher.finalize());
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
    if let Err(error) = validate_extracted_project(&temp_dir.join(&manifest.project_file)) {
        drop(temp);
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(error);
    }

    let backup = if destination.exists() {
        let backup = parent.join(format!(
            ".{}.previous-{}-{}",
            destination
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "gridscalr".to_string()),
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or(0)
        ));
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
pub fn package_cancel(job_id: String) {
    if let Ok(registry) = jobs().lock() {
        if let Some(flag) = registry.get(&job_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
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

#[tauri::command]
pub fn package_inspect(package_path: String) -> Result<InspectionResult, PackageError> {
    inspect_package(Path::new(&package_path))
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
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let counter = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "gridscalr-package-test-{}-{counter}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn file(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write(path: &Path, bytes: &[u8]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, bytes).expect("write fixture");
    }

    fn sha(bytes: &[u8]) -> String {
        hash_bytes(bytes)
    }

    fn project_json(relative: &str, extra: &str) -> String {
        let separator = if extra.is_empty() { "" } else { "," };
        format!(
            r#"{{"schemaVersion":21,"name":"Plan","documents":[{{"id":"doc_1","kind":"pdf","name":"Plan.pdf","path":null,"relativePath":"{relative}","sha256":"","pageCount":1,"sizeBytes":1}}],"layers":[]{separator}{extra}}}"#
        )
    }

    fn request(output: &Path, project: &str, sources: Vec<(&Path, &str, &str)>) -> PackageRequest {
        let documents = sources
            .into_iter()
            .map(|(path, archive, expected)| PackageSource {
                source_path: path_string(path),
                archive_path: archive.to_string(),
                kind: "pdf".to_string(),
                expected_sha256: expected.to_string(),
            })
            .collect();
        PackageRequest {
            job_id: "test-job".to_string(),
            output_path: path_string(output),
            project_file_name: "Plan.gridscalr".to_string(),
            project_json: project.to_string(),
            project_schema: 21,
            app_version: "0.16.1".to_string(),
            created_at: "2026-11-01T10:00:00.000Z".to_string(),
            documents,
            exports: Vec::new(),
            source_scans: Vec::new(),
            protected_paths: Vec::new(),
        }
    }

    fn create(request: &PackageRequest) -> Result<CreateResult, PackageError> {
        create_package(request, None, &AtomicBool::new(false))
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
        let manual_project =
            fs::read_to_string(manual.join("Plan.gridscalr")).expect("manual project");
        let value: serde_json::Value = serde_json::from_str(&manual_project).expect("project json");
        assert_eq!(
            value["documents"][0]["relativePath"],
            serde_json::Value::String("documents/Plan.pdf".to_string())
        );
        assert!(value["documents"][0]["path"].is_null());
        assert!(manual.join("documents/Plan.pdf").is_file());
    }

    #[test]
    fn rejects_a_missing_source_file() {
        let directory = TestDir::new();
        let output = directory.file("Plan.gridscalr.zip");
        let missing = directory.file("source/missing.pdf");
        let request = request(
            &output,
            &project_json("documents/Plan.pdf", ""),
            vec![(&missing, "documents/Plan.pdf", "")],
        );
        let error = create(&request).expect_err("missing source");
        match error {
            PackageError::MissingSource { files } => {
                assert_eq!(files.len(), 1);
                assert_eq!(files[0].name, "missing.pdf");
            }
            other => panic!("unexpected error: {other:?}"),
        }
        assert!(!output.exists());
    }

    #[test]
    fn reports_a_checksum_mismatch_and_accepts_the_actual_file_on_retry() {
        let directory = TestDir::new();
        let source = directory.file("source/Plan.pdf");
        write(&source, b"%PDF-1.4 current");
        let output = directory.file("Plan.gridscalr.zip");
        let mut request = request(
            &output,
            &project_json("documents/Plan.pdf", ""),
            vec![(&source, "documents/Plan.pdf", &"0".repeat(64))],
        );
        let error = create(&request).expect_err("checksum mismatch");
        let mismatch = match error {
            PackageError::ChecksumMismatch { files } => files.into_iter().next().expect("one file"),
            other => panic!("unexpected error: {other:?}"),
        };
        assert_eq!(mismatch.name, "Plan.pdf");
        assert_eq!(mismatch.size_bytes, b"%PDF-1.4 current".len() as u64);
        assert!(!output.exists());

        request.documents[0].expected_sha256 = mismatch.actual;
        create(&request).expect("retry with the actual checksum");
        assert!(output.is_file());
    }

    #[test]
    fn cancellation_leaves_no_package_or_temporary_file() {
        let directory = TestDir::new();
        let source = directory.file("source/Plan.pdf");
        write(&source, b"%PDF-1.4 plan");
        let output = directory.file("Plan.gridscalr.zip");
        let request = request(
            &output,
            &project_json("documents/Plan.pdf", ""),
            vec![(&source, "documents/Plan.pdf", "")],
        );
        let cancelled = AtomicBool::new(true);
        let error = create_package(&request, None, &cancelled).expect_err("cancelled");
        assert!(matches!(error, PackageError::Cancelled));
        assert!(!output.exists());
        assert!(fs::read_dir(directory.path())
            .expect("read directory")
            .all(|entry| !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .contains(".tmp")));
    }

    #[test]
    fn cancellation_mid_write_cleans_the_temporary_file() {
        let directory = TestDir::new();
        let source = directory.file("source/Large.pdf");
        let bytes: Vec<u8> = (0..64 * 1024 * 1024)
            .map(|index| (index % 251) as u8)
            .collect();
        write(&source, &bytes);
        let output = directory.file("Plan.gridscalr.zip");
        let request = request(
            &output,
            &project_json("documents/Large.pdf", ""),
            vec![(&source, "documents/Large.pdf", "")],
        );
        let cancelled = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&cancelled);
        let stopper = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(5));
            flag.store(true, Ordering::SeqCst);
        });
        let error = create_package(&request, None, &cancelled).expect_err("cancelled");
        stopper.join().expect("stopper thread");
        assert!(matches!(error, PackageError::Cancelled));
        assert!(!output.exists());
        let leftovers: Vec<String> = fs::read_dir(directory.path())
            .expect("read directory")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .to_string()
            })
            .filter(|name| name.contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }

    #[test]
    fn rejects_duplicate_archive_names() {
        let directory = TestDir::new();
        let first = directory.file("source/a.pdf");
        let second = directory.file("source/b.pdf");
        write(&first, b"a");
        write(&second, b"b");
        let output = directory.file("Plan.gridscalr.zip");
        let request = request(
            &output,
            &project_json("documents/Same.pdf", ""),
            vec![
                (&first, "documents/Same.pdf", ""),
                (&second, "documents/same.pdf", ""),
            ],
        );
        assert!(matches!(
            create(&request).expect_err("duplicate"),
            PackageError::InvalidPackage { .. }
        ));
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
    fn rejects_zip_slip_and_absolute_entry_names() {
        let directory = TestDir::new();
        for (name, entry) in [("slip.zip", "../evil.txt"), ("absolute.zip", "/evil.txt")] {
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
                "{name}"
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

    #[test]
    fn rejects_an_extracted_project_with_absolute_or_external_links() {
        let directory = TestDir::new();
        let absolute = directory.file("absolute.gridscalr");
        fs::write(
            &absolute,
            r#"{"documents":[{"path":"/home/ana/Plan.pdf","relativePath":null}]}"#,
        )
        .expect("write absolute project");
        assert!(validate_extracted_project(&absolute).is_err());

        let external = directory.file("external.gridscalr");
        fs::write(
            &external,
            r#"{"documents":[{"path":null,"relativePath":"../Plan.pdf"}]}"#,
        )
        .expect("write external project");
        assert!(validate_extracted_project(&external).is_err());

        let valid = directory.file("valid.gridscalr");
        fs::write(
            &valid,
            r#"{"documents":[{"path":null,"relativePath":"documents/Plan.pdf"}]}"#,
        )
        .expect("write valid project");
        validate_extracted_project(&valid).expect("valid packaged project");
    }

    #[test]
    fn default_options_include_no_exports_or_scans() {
        let directory = TestDir::new();
        let source = directory.file("source/Plan.pdf");
        write(&source, b"pdf");
        let output = directory.file("Plan.gridscalr.zip");
        let request = request(
            &output,
            &project_json("documents/Plan.pdf", ""),
            vec![(&source, "documents/Plan.pdf", "")],
        );
        let result = create(&request).expect("create");
        assert!(result.manifest.exports.is_empty());
        assert!(result.manifest.source_scans.is_empty());
    }
}
