use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::commands::{replace_file, unique_sibling, CommandError};
use crate::path_guard::{
    ensure_inside_root, ensure_writable, is_inside, too_large, MAX_HASH_SCAN_BYTES,
    MAX_SOURCE_BYTES,
};
use crate::temp_cleanup::clean_stale_temporaries;

/// Copies one reference drawing into the project's sibling drawings folder.
///
/// The source is opened read-only, the copy is written to a flushed temporary
/// sibling and verified against the source SHA-256 before the single rename.
/// The destination never overlaps a protected source path.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCopyRequest {
    pub source_path: String,
    pub project_path: String,
    pub display_name: String,
    #[serde(default)]
    pub protected_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCopyInfo {
    pub destination_path: String,
    pub relative_path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFileInfo {
    pub path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

const WINDOWS_RESERVED: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let digest = hasher.finalize();
    let mut text = String::with_capacity(digest.len() * 2);
    for byte in digest {
        text.push_str(&format!("{byte:02x}"));
    }
    Ok(text)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

/// File-system comparison key is owned by `path_guard`; this module must not
/// grow a second, subtly different comparison.
fn ensure_destination_free(
    destination: &Path,
    protected_paths: &[String],
) -> Result<(), CommandError> {
    ensure_writable(&destination.to_string_lossy(), protected_paths)?;
    for protected in protected_paths
        .iter()
        .filter(|path| !path.trim().is_empty())
    {
        if is_inside(destination, Path::new(protected)) {
            return Err(CommandError::new(
                "sourceOverwrite",
                format!("{}: inside a protected source path", destination.display()),
            ));
        }
    }
    Ok(())
}

/// Removes an extension and characters that Windows or macOS reject. The
/// result is a display name only; it never reintroduces a directory.
fn safe_base(display_name: &str, fallback: &str) -> String {
    let leaf = display_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(display_name);
    let without_extension = leaf
        .rsplit_once('.')
        .filter(|(base, _)| !base.is_empty())
        .map(|(base, _)| base)
        .unwrap_or(leaf);
    let mut base: String = without_extension
        .chars()
        .map(|character| {
            if character.is_control() || "<>:\"/\\|?*".contains(character) {
                '_'
            } else {
                character
            }
        })
        .collect();
    base = base.trim().trim_matches(['.', ' ']).to_string();
    if base.is_empty() {
        base = fallback.to_string();
    }
    if WINDOWS_RESERVED.contains(&base.to_lowercase().as_str()) {
        base = format!("_{base}");
    }
    base.chars().take(80).collect::<String>().trim().to_string()
}

fn project_folder(project_path: &Path) -> Result<PathBuf, CommandError> {
    project_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            CommandError::new(
                "invalidPayload",
                format!("{} has no folder", project_path.display()),
            )
        })
}

fn project_stem(project_path: &Path) -> String {
    let name = project_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    let stem = match name.rfind('.') {
        Some(index) if name[index..].eq_ignore_ascii_case(".gridscalr") => {
            name[..index].to_string()
        }
        _ => name,
    };
    safe_base(&stem, "Project")
}

fn relative_path(folder: &str, file: &str) -> String {
    format!("{folder}/{file}")
}

/// The one managed-copy folder for a project: `<project folder>/<stem>.drawings`.
///
/// Listing and deletion use this helper instead of rebuilding the name, so a
/// file can only ever be removed from the folder the copy command writes to.
/// The folder must resolve inside the project folder; a symlinked or junctioned
/// drawings folder that escapes it is refused rather than followed.
pub(crate) fn drawings_folder(project_path: &Path) -> Result<(PathBuf, String), CommandError> {
    let folder = project_folder(project_path)?;
    let drawings_name = format!("{}.drawings", project_stem(project_path));
    let drawings_folder = folder.join(&drawings_name);
    ensure_inside_root(&drawings_folder, &folder, "unsafePath")?;
    Ok((drawings_folder, drawings_name))
}

fn copy_stream(source: &Path, destination: &Path) -> std::io::Result<()> {
    let mut input = File::open(source)?;
    let mut output = File::create(destination)?;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        output.write_all(&buffer[..read])?;
    }
    output.sync_all()
}

/// Copies a drawing and returns the verified destination. Re-running with the
/// same source and hash reuses the existing identical copy instead of growing
/// the folder or duplicating the file in a package.
pub(crate) fn copy_to_project(
    request: &SourceCopyRequest,
) -> Result<ManagedCopyInfo, CommandError> {
    copy_to_project_limited(request, MAX_SOURCE_BYTES)
}

/// The size check runs before the source is hashed or streamed: a managed copy
/// doubles the disk use of a drawing, so a source above the documented read cap
/// is refused with a structured `fileTooLarge` instead of copied (F-045).
fn copy_to_project_limited(
    request: &SourceCopyRequest,
    max_bytes: u64,
) -> Result<ManagedCopyInfo, CommandError> {
    let source = Path::new(&request.source_path);
    let metadata = fs::metadata(source).map_err(|error| {
        CommandError::new("readFailed", format!("{}: {error}", source.display()))
    })?;
    if !metadata.is_file() {
        return Err(CommandError::new("notAFile", source.display().to_string()));
    }
    if metadata.len() > max_bytes {
        return Err(too_large(source, metadata.len(), max_bytes));
    }
    let sha256 = hash_file(source).map_err(|error| {
        CommandError::new("readFailed", format!("{}: {error}", source.display()))
    })?;
    let size_bytes = metadata.len();

    let project_path = Path::new(&request.project_path);
    let (drawings_folder, drawings_name) = drawings_folder(project_path)?;
    let file_name = format!(
        "{}-{}.pdf",
        safe_base(&request.display_name, "Drawing"),
        &sha256[..8]
    );
    let destination = drawings_folder.join(&file_name);
    ensure_destination_free(&destination, &request.protected_paths)?;

    if destination.exists() {
        let existing = hash_file(&destination).map_err(|error| {
            CommandError::new("readFailed", format!("{}: {error}", destination.display()))
        })?;
        if existing != sha256 {
            return Err(CommandError::new(
                "sourceCopyConflict",
                format!(
                    "{} already exists with different contents",
                    destination.display()
                ),
            ));
        }
    } else {
        fs::create_dir_all(&drawings_folder).map_err(|error| {
            CommandError::new(
                "createFolderFailed",
                format!("{}: {error}", drawings_folder.display()),
            )
        })?;
        clean_stale_temporaries(&destination);
        let temp = unique_sibling(&destination, "copy");
        if let Err(error) = copy_stream(source, &temp) {
            let _ = fs::remove_file(&temp);
            return Err(CommandError::new(
                "writeFailed",
                format!("{}: {error}", destination.display()),
            ));
        }
        let copied = match hash_file(&temp) {
            Ok(hash) => hash,
            Err(error) => {
                let _ = fs::remove_file(&temp);
                return Err(CommandError::new(
                    "readBackMismatch",
                    format!("{}: {error}", destination.display()),
                ));
            }
        };
        if copied != sha256 {
            let _ = fs::remove_file(&temp);
            return Err(CommandError::new(
                "readBackMismatch",
                format!(
                    "{}: copied bytes do not match the source",
                    destination.display()
                ),
            ));
        }
        replace_file(
            &temp,
            &destination,
            &destination
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| file_name.clone()),
        )?;
    }

    // Verify the final file, not only the temporary one.
    let final_hash = hash_file(&destination).map_err(|error| {
        CommandError::new("readFailed", format!("{}: {error}", destination.display()))
    })?;
    let final_size = fs::metadata(&destination)
        .map_err(|error| {
            CommandError::new("readFailed", format!("{}: {error}", destination.display()))
        })?
        .len();
    if final_hash != sha256 || final_size != size_bytes {
        return Err(CommandError::new(
            "readBackMismatch",
            format!("{}: the copy did not verify", destination.display()),
        ));
    }

    Ok(ManagedCopyInfo {
        destination_path: destination.to_string_lossy().to_string(),
        relative_path: relative_path(&drawings_name, &file_name),
        sha256,
        size_bytes,
    })
}

pub(crate) fn file_info(path: &Path) -> Result<Option<SourceFileInfo>, CommandError> {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => {
            let sha256 = hash_file(path).map_err(|error| {
                CommandError::new("readFailed", format!("{}: {error}", path.display()))
            })?;
            Ok(Some(SourceFileInfo {
                path: path.to_string_lossy().to_string(),
                sha256,
                size_bytes: metadata.len(),
            }))
        }
        Ok(_) => Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(CommandError::new(
            "readFailed",
            format!("{}: {error}", path.display()),
        )),
    }
}

/// Checks only the candidate folder, never the whole file system. Used as an
/// additive relink helper when a drawing moved but its checksum is unchanged.
pub(crate) fn find_by_hash(
    folder: &Path,
    expected_sha256: &str,
) -> Result<Option<SourceFileInfo>, CommandError> {
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(CommandError::new(
                "readFailed",
                format!("{}: {error}", folder.display()),
            ))
        }
    };
    let expected = expected_sha256.to_ascii_lowercase();
    let mut checked = 0;
    let mut scanned_bytes = 0_u64;
    for entry in entries {
        let entry = entry.map_err(|error| {
            CommandError::new("readFailed", format!("{}: {error}", folder.display()))
        })?;
        if checked >= 4096 || scanned_bytes >= MAX_HASH_SCAN_BYTES {
            break;
        }
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if !matches!(extension.as_str(), "pdf" | "tif" | "tiff") {
            continue;
        }
        checked += 1;
        let size = fs::metadata(&path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        scanned_bytes = scanned_bytes.saturating_add(size);
        let Some(info) = file_info(&path)? else {
            continue;
        };
        if info.sha256.eq_ignore_ascii_case(&expected) {
            return Ok(Some(info));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn source_copy_to_project(request: SourceCopyRequest) -> Result<ManagedCopyInfo, CommandError> {
    copy_to_project(&request)
}

#[tauri::command]
pub fn source_file_hash(path: String) -> Result<Option<SourceFileInfo>, CommandError> {
    file_info(Path::new(&path))
}

#[tauri::command]
pub fn source_find_by_hash(
    folder: String,
    expected_sha256: String,
) -> Result<Option<SourceFileInfo>, CommandError> {
    if !is_sha256(&expected_sha256) {
        return Err(CommandError::new(
            "invalidPayload",
            "expectedSha256 is not a SHA-256 value",
        ));
    }
    find_by_hash(Path::new(&folder), &expected_sha256)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "gridscalr-source-copy-test-{}-{counter}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn file(&self, name: &str, bytes: &[u8]) -> PathBuf {
            let path = self.0.join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create parent");
            }
            fs::write(&path, bytes).expect("write fixture");
            path
        }

        fn project(&self) -> PathBuf {
            let path = self.0.join("Level 01.gridscalr");
            fs::write(&path, b"{}").expect("write project");
            path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn request(dir: &TestDir, source: &Path, name: &str) -> SourceCopyRequest {
        SourceCopyRequest {
            source_path: source.to_string_lossy().to_string(),
            project_path: dir.project().to_string_lossy().to_string(),
            display_name: name.to_string(),
            protected_paths: vec![source.to_string_lossy().to_string()],
        }
    }

    #[test]
    fn copies_a_drawing_into_the_project_and_leaves_the_source_unchanged() {
        let dir = TestDir::new();
        let source = dir.file("Shared/Plan.pdf", b"%PDF-1.4 source");
        let before = fs::read(&source).expect("read source");
        let sha = hash_file(&source).expect("hash source");
        let info = copy_to_project(&request(&dir, &source, "Plan.pdf")).expect("copy");
        let expected = format!("Level 01.drawings/Plan-{}.pdf", &sha[..8]);
        assert!(info.destination_path.ends_with(&expected));
        assert_eq!(info.size_bytes, before.len() as u64);
        assert_eq!(fs::read(&source).expect("read source"), before);
        assert_eq!(fs::read(&info.destination_path).expect("read copy"), before);
        assert_eq!(info.relative_path, expected);
    }

    #[test]
    fn refuses_a_source_over_the_copy_cap_before_streaming_it() {
        let dir = TestDir::new();
        let bytes = b"%PDF-1.4 source drawing";
        let source = dir.file("Plan.pdf", bytes);
        let copy = request(&dir, &source, "Plan.pdf");

        let error = copy_to_project_limited(&copy, 8).expect_err("over the copy cap");
        assert_eq!(error.code, "fileTooLarge");
        assert!(
            !dir.0.join("Level 01.drawings").exists(),
            "nothing is created before the size check"
        );
        assert_eq!(
            fs::read(&source).expect("read source"),
            bytes,
            "the source drawing is never modified"
        );
        // The documented limit is the one the command uses, so the same fixture
        // succeeds without the test cap.
        copy_to_project(&copy).expect("within the documented cap");
        assert!(dir.0.join("Level 01.drawings").is_dir());
    }

    #[test]
    fn reuses_an_identical_copy_instead_of_duplicating_it() {
        let dir = TestDir::new();
        let source = dir.file("Plan.pdf", b"%PDF-1.4 source");
        let first = copy_to_project(&request(&dir, &source, "Plan.pdf")).expect("first copy");
        let second = copy_to_project(&request(&dir, &source, "Plan.pdf")).expect("second copy");
        assert_eq!(first.destination_path, second.destination_path);
        let files = fs::read_dir(dir.0.join("Level 01.drawings"))
            .expect("read folder")
            .count();
        assert_eq!(files, 1);
    }

    #[test]
    fn rejects_a_destination_inside_a_protected_path() {
        let dir = TestDir::new();
        let source = dir.file("Plan.pdf", b"%PDF-1.4 source");
        let mut copy = request(&dir, &source, "Plan.pdf");
        copy.protected_paths = vec![dir
            .0
            .join("Level 01.drawings")
            .to_string_lossy()
            .to_string()];
        let error = copy_to_project(&copy).expect_err("must reject");
        assert_eq!(error.code, "sourceOverwrite");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_drawings_folder_that_escapes_the_project_through_a_symlink() {
        use std::os::unix::fs::symlink;

        let dir = TestDir::new();
        let outside = TestDir::new();
        let source = dir.file("Plan.pdf", b"%PDF-1.4 source");
        symlink(&outside.0, dir.0.join("Level 01.drawings")).expect("create symlink");

        let error = copy_to_project(&request(&dir, &source, "Plan.pdf"))
            .expect_err("a symlinked drawings folder must be rejected");
        assert_eq!(error.code, "unsafePath");
        assert_eq!(
            fs::read_dir(&outside.0).expect("read outside").count(),
            0,
            "nothing may be written outside the project folder"
        );
        assert_eq!(
            fs::read(&source).expect("read source"),
            b"%PDF-1.4 source",
            "the source drawing is never modified"
        );
    }

    #[test]
    fn sanitizes_unsafe_and_reserved_display_names() {
        assert_eq!(safe_base("CON.pdf", "Drawing"), "_CON");
        assert_eq!(safe_base("../../Plan?.pdf", "Drawing"), "Plan_");
        assert_eq!(safe_base("   ", "Drawing"), "Drawing");
        assert!(safe_base(&"a".repeat(300), "Drawing").chars().count() <= 80);
    }

    #[test]
    fn reports_an_existing_hash_and_finds_it_in_one_folder() {
        let dir = TestDir::new();
        let source = dir.file("Folder/Plan.pdf", b"%PDF-1.4 source");
        let info = file_info(&source).expect("hash fixture").expect("exists");
        let found = find_by_hash(&source.parent().unwrap(), &info.sha256)
            .expect("search")
            .expect("found");
        assert_eq!(found.path, info.path);
        assert!(find_by_hash(&source.parent().unwrap(), &"0".repeat(64))
            .expect("search")
            .is_none());
        assert!(find_by_hash(&dir.0.join("missing"), &info.sha256)
            .expect("missing folder")
            .is_none());
        assert!(file_info(&dir.0.join("missing.pdf"))
            .expect("missing")
            .is_none());
    }
}
