//! The package command error surface.
//!
//! The `kind` tag and camelCase fields are the frontend contract; the frontend
//! normalizes an unknown or malformed failure rather than trusting the shape.

use serde::Serialize;

use crate::commands::CommandError;
use crate::package_limits::OutputLimitError;

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PackageError {
    Cancelled,
    MissingSource {
        files: Vec<MissingFile>,
    },
    ChecksumMismatch {
        files: Vec<ChecksumMismatch>,
    },
    DestinationExists {
        path: String,
    },
    SourceOverwrite,
    InsufficientSpace {
        required_bytes: u64,
        available_bytes: u64,
    },
    /// The content is larger than any extraction accepts (F-044).
    TooLarge {
        required_bytes: u64,
        max_bytes: u64,
    },
    InvalidPackage {
        message: String,
    },
    Io {
        message: String,
    },
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

impl From<CommandError> for PackageError {
    fn from(error: CommandError) -> Self {
        if error.code == "sourceOverwrite" {
            PackageError::SourceOverwrite
        } else {
            PackageError::Io {
                message: format!("{}: {}", error.code, error.detail),
            }
        }
    }
}

impl From<OutputLimitError> for PackageError {
    fn from(error: OutputLimitError) -> Self {
        match error {
            OutputLimitError::TooLarge {
                required_bytes,
                max_bytes,
            } => PackageError::TooLarge {
                required_bytes,
                max_bytes,
            },
            OutputLimitError::InsufficientSpace {
                required_bytes,
                available_bytes,
            } => PackageError::InsufficientSpace {
                required_bytes,
                available_bytes,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::PackageError;

    #[test]
    fn serializes_package_limits_with_camel_case_fields() {
        let space = serde_json::to_value(PackageError::InsufficientSpace {
            required_bytes: 5,
            available_bytes: 1,
        })
        .expect("serialize space error");
        assert_eq!(space["kind"], "insufficientSpace");
        assert_eq!(space["requiredBytes"], 5);
        assert_eq!(space["availableBytes"], 1);

        let size = serde_json::to_value(PackageError::TooLarge {
            required_bytes: 9,
            max_bytes: 3,
        })
        .expect("serialize size error");
        assert_eq!(size["kind"], "tooLarge");
        assert_eq!(size["requiredBytes"], 9);
        assert_eq!(size["maxBytes"], 3);
    }
}
