//! Wire types shared by the package commands and their pure implementation.
//!
//! The command layer serializes these with camelCase fields, so a rename is a
//! frontend contract change, not an internal refactor.

use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub derived_caches: Vec<ManifestFile>,
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
    pub derived_caches: Vec<PackageSource>,
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
    /// Uncompressed size of the extracted package, shown before extraction.
    pub uncompressed_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub project_path: String,
    pub manifest: PackageManifest,
    pub manifest_json: String,
    pub extracted_to: String,
}
