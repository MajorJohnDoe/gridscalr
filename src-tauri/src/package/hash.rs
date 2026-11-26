//! SHA-256 helpers shared by package writing and extraction.

use sha2::{Digest, Sha256};

/// Lowercase hex encoding of a digest. sha2 0.11 returns a hybrid-array that no
/// longer implements `LowerHex`, so the conversion is explicit.
pub(crate) fn hex_digest(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut hex = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(hex, "{byte:02x}");
    }
    hex
}

pub(crate) fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex_digest(&hasher.finalize())
}
