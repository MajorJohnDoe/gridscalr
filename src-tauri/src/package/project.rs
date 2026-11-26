//! Validation of the project JSON inside a package.
//!
//! A package must be portable: the project may not keep an absolute document
//! path, and every relative path must stay inside `documents/`. Validation runs
//! before writing and again after extraction, on the staged copy.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use super::error::PackageError;
use super::names::validate_archive_name;

pub(crate) fn validate_project_json(
    json: &str,
    document_paths: &HashSet<String>,
) -> Result<(), PackageError> {
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

pub(crate) fn validate_extracted_project(path: &Path) -> Result<(), PackageError> {
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

#[cfg(test)]
mod tests;
