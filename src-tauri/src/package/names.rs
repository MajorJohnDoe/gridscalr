//! Archive names and the small path helpers used to report and stage files.
//!
//! Every name that enters or leaves a ZIP goes through [`validate_entry_name`],
//! so a package can never write outside its extraction folder.

use std::path::{Component, Path};

use super::error::PackageError;

pub(crate) fn validate_entry_name(name: &str) -> Result<(), PackageError> {
    if name.is_empty() || name.len() > 240 {
        return Err(PackageError::InvalidPackage {
            message: "The package contains an empty or too long file name.".to_string(),
        });
    }
    if name.chars().any(|character| character.is_control())
        || name.contains(['\\', '\0', ':'])
        || name.starts_with('/')
    {
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

pub(crate) fn validate_archive_name(name: &str, prefix: Option<&str>) -> Result<(), PackageError> {
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

/// Turns a project name into a folder name every supported file system accepts.
pub(crate) fn sanitize_folder(name: &str) -> String {
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

pub(crate) fn project_stem(project_file: &str) -> String {
    project_file
        .strip_suffix(".gridscalr")
        .unwrap_or(project_file)
        .to_string()
}

pub(crate) fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

pub(crate) fn display_name(path: &str) -> String {
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}
