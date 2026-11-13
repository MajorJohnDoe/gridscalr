//! Output limits for package creation (F-044).
//!
//! Extraction is bounded by a documented uncompressed cap and a free-space
//! probe. The creating side follows the same rules so a user cannot build a
//! package that no extraction will accept, and a nearly full destination fails
//! before a single byte is written instead of part-way through the write.
//!
//! The probe stays best-effort exactly like the extraction side: when the
//! platform cannot report free space (`available` is `None`) the explicit byte
//! cap remains the only limit.

use crate::disk_space;

/// Why a package cannot be written to the chosen output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum OutputLimitError {
    /// The content is larger than the documented uncompressed package cap.
    TooLarge { required_bytes: u64, max_bytes: u64 },
    /// The destination volume cannot hold the content plus the reserve.
    InsufficientSpace {
        required_bytes: u64,
        available_bytes: u64,
    },
}

/// Refuses an output over the cap or larger than the destination volume.
///
/// `content_bytes` is an upper bound of the uncompressed content: documents are
/// stored uncompressed, the JSON and the README are deflated, so the written ZIP
/// is never larger than this figure plus the archive headers.
pub(crate) fn ensure_output_fits(
    content_bytes: u64,
    max_bytes: u64,
    available: Option<u64>,
) -> Result<(), OutputLimitError> {
    if content_bytes > max_bytes {
        return Err(OutputLimitError::TooLarge {
            required_bytes: content_bytes,
            max_bytes,
        });
    }
    let required = disk_space::required_bytes(content_bytes);
    match available {
        Some(available) if available < required => Err(OutputLimitError::InsufficientSpace {
            required_bytes: required,
            available_bytes: available,
        }),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_content_exactly_at_the_cap_with_free_space() {
        let reserved = disk_space::required_bytes(1024);
        assert_eq!(ensure_output_fits(1024, 1024, Some(reserved)), Ok(()));
    }

    #[test]
    fn refuses_content_one_byte_over_the_cap() {
        let error = ensure_output_fits(1025, 1024, Some(u64::MAX)).expect_err("over the cap");
        assert_eq!(
            error,
            OutputLimitError::TooLarge {
                required_bytes: 1025,
                max_bytes: 1024,
            }
        );
    }

    #[test]
    fn refuses_a_destination_volume_that_cannot_hold_the_content() {
        let reserved = disk_space::required_bytes(1024);
        let error = ensure_output_fits(1024, u64::MAX, Some(reserved - 1)).expect_err("no space");
        assert_eq!(
            error,
            OutputLimitError::InsufficientSpace {
                required_bytes: reserved,
                available_bytes: reserved - 1,
            }
        );
    }

    #[test]
    fn keeps_the_byte_cap_when_free_space_is_unknown() {
        assert_eq!(ensure_output_fits(1024, 4096, None), Ok(()));
    }
}
