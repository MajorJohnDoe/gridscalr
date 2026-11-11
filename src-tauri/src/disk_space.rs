//! Free-space check for package extraction (F-033).
//!
//! A malicious or corrupted package must not be able to fill the disk before
//! its per-file checksum and destination rename complete. The probe is
//! deliberately best-effort: when the platform cannot report free space the
//! caller keeps the explicit byte cap and the user-visible size instead of
//! pretending the check succeeded.

use std::path::Path;

/// A small reserve on top of the uncompressed size so the temporary folder,
/// the rename and the file-system metadata fit.
pub(crate) const SPACE_RESERVE_BYTES: u64 = 64 * 1024 * 1024;

pub(crate) fn required_bytes(uncompressed: u64) -> u64 {
    uncompressed.saturating_add(SPACE_RESERVE_BYTES)
}

#[cfg(unix)]
pub(crate) fn available_bytes(directory: &Path) -> Option<u64> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let path = CString::new(directory.as_os_str().as_bytes()).ok()?;
    // SAFETY: `statvfs` only writes into the provided struct, and the path is a
    // valid NUL-terminated string for the duration of the call.
    let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    let result = unsafe { libc::statvfs(path.as_ptr(), stats.as_mut_ptr()) };
    if result != 0 {
        return None;
    }
    // SAFETY: `statvfs` returned success, so the struct is initialized.
    let stats = unsafe { stats.assume_init() };
    let block_size = stats.f_frsize.max(1) as u64;
    Some((stats.f_bavail as u64).saturating_mul(block_size))
}

#[cfg(windows)]
pub(crate) fn available_bytes(directory: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let mut wide: Vec<u16> = directory.as_os_str().encode_wide().collect();
    wide.push(0);
    let mut available: u64 = 0;
    // SAFETY: the directory name is NUL-terminated and the output pointers are
    // valid for the duration of the call.
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        None
    } else {
        Some(available)
    }
}

#[cfg(not(any(unix, windows)))]
pub(crate) fn available_bytes(_directory: &Path) -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_a_reserve_to_the_required_size() {
        assert_eq!(required_bytes(0), SPACE_RESERVE_BYTES);
        assert_eq!(required_bytes(1024), SPACE_RESERVE_BYTES + 1024);
        assert_eq!(required_bytes(u64::MAX), u64::MAX);
    }

    #[test]
    fn reports_a_number_for_an_existing_directory_or_nothing() {
        // The probe is best-effort; either a number or `None` is acceptable, but
        // it must never panic for a missing or unusual path.
        let directory = std::env::temp_dir();
        if let Some(bytes) = available_bytes(&directory) {
            assert!(bytes > 0);
        }
        assert_eq!(available_bytes(Path::new("")), None);
    }
}
