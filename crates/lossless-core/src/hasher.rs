use crate::buffer::SecureBuffer;
use crate::error::{LosslessError, Result};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, BufReader, Read};
use std::path::Path;

/// Stream read buffer size (64 KB matches default chunk size and L2 cache efficiency).
const BUFFER_SIZE: usize = 64 * 1024;

/// High-performance streaming bit-for-bit SHA-256 hasher.
#[derive(Default, Clone)]
pub struct StreamingHasher {
    hasher: Sha256,
    bytes_processed: u64,
}

impl StreamingHasher {
    /// Creates a new streaming hasher.
    pub fn new() -> Self {
        Self {
            hasher: Sha256::new(),
            bytes_processed: 0,
        }
    }

    /// Feeds a chunk of bytes into the streaming hash state.
    #[inline]
    pub fn update(&mut self, data: &[u8]) {
        self.hasher.update(data);
        self.bytes_processed += data.len() as u64;
    }

    /// Returns the total number of bytes processed so far.
    #[inline]
    pub fn bytes_processed(&self) -> u64 {
        self.bytes_processed
    }

    /// Finalizes the hash calculation and returns the 32-byte SHA-256 digest.
    pub fn finalize(self) -> [u8; 32] {
        self.hasher.finalize().into()
    }

    /// Finalizes the hash calculation and returns the lowercase hex-encoded string.
    pub fn finalize_hex(self) -> String {
        hex::encode(self.finalize())
    }
}

/// Computes the SHA-256 hex digest of any `Read` stream with zero disk persistence.
///
/// Reads through a reusable memory buffer that is wiped on drop.
pub fn hash_reader<R: Read>(reader: &mut R) -> Result<String> {
    let mut hasher = StreamingHasher::new();
    let mut buf = SecureBuffer::zeroed(BUFFER_SIZE);

    loop {
        let bytes_read = reader.read(&mut buf)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buf[..bytes_read]);
    }

    Ok(hasher.finalize_hex())
}

/// Computes SHA-256 hex digest of a byte slice in memory.
pub fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = StreamingHasher::new();
    hasher.update(data);
    hasher.finalize_hex()
}

/// Computes SHA-256 hex digest of a file on disk or stdin (when path is "-").
pub fn hash_file<P: AsRef<Path>>(path: P) -> Result<String> {
    let path_ref = path.as_ref();
    if path_ref == Path::new("-") {
        let mut stdin = io::stdin().lock();
        hash_reader(&mut stdin)
    } else {
        let file = File::open(path_ref)?;
        let mut reader = BufReader::with_capacity(BUFFER_SIZE, file);
        hash_reader(&mut reader)
    }
}

/// Verifies whether the stream's calculated SHA-256 matches `expected_hex` bit-for-bit.
///
/// Returns `Ok(())` if 100% match, or `Err(LosslessError::HashMismatch)` if mismatched.
pub fn verify_reader<R: Read>(reader: &mut R, expected_hex: &str) -> Result<()> {
    let clean_expected = expected_hex.trim().to_ascii_lowercase();
    // Validate hex format up front
    if clean_expected.len() != 64 {
        return Err(LosslessError::HashMismatch {
            expected: clean_expected,
            calculated: format!(
                "invalid length: expected 64 hex characters, got {}",
                expected_hex.len()
            ),
        });
    }

    let calculated = hash_reader(reader)?;
    if constant_time_eq(calculated.as_bytes(), clean_expected.as_bytes()) {
        Ok(())
    } else {
        Err(LosslessError::HashMismatch {
            expected: clean_expected,
            calculated,
        })
    }
}

/// Verifies whether a file's SHA-256 matches `expected_hex` bit-for-bit.
pub fn verify_file<P: AsRef<Path>>(path: P, expected_hex: &str) -> Result<()> {
    let path_ref = path.as_ref();
    if path_ref == Path::new("-") {
        let mut stdin = io::stdin().lock();
        verify_reader(&mut stdin, expected_hex)
    } else {
        let file = File::open(path_ref)?;
        let mut reader = BufReader::with_capacity(BUFFER_SIZE, file);
        verify_reader(&mut reader, expected_hex)
    }
}

/// Constant-time slice comparison to prevent timing side channels during hash verification.
#[inline]
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_empty_input_known_sha256() {
        // Arrange
        let expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let mut cursor = Cursor::new(b"");

        // Act
        let calculated = hash_reader(&mut cursor).expect("hashing succeeds");

        // Assert
        assert_eq!(calculated, expected);
    }

    #[test]
    fn test_standard_known_sha256() {
        // NIST test vector for "abc"
        // Arrange
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        let mut cursor = Cursor::new(b"abc");

        // Act
        let calculated = hash_reader(&mut cursor).expect("hashing succeeds");

        // Assert
        assert_eq!(calculated, expected);
    }

    #[test]
    fn test_verify_reader_exact_match() {
        // Arrange
        let data = b"LosslessDrop Zero Persistence WebRTC Data";
        let hash = hash_bytes(data);
        let mut cursor = Cursor::new(data);

        // Act & Assert
        let res = verify_reader(&mut cursor, &hash);
        assert!(res.is_ok());
    }

    #[test]
    fn test_verify_reader_mismatch_single_bit_flip() {
        // Arrange
        let data = b"LosslessDrop Zero Persistence WebRTC Data";
        let hash = hash_bytes(data);

        // Flip 1 bit in data
        let mut tampered = data.to_vec();
        tampered[0] ^= 0x01;
        let mut cursor = Cursor::new(tampered);

        // Act
        let res = verify_reader(&mut cursor, &hash);

        // Assert
        assert!(matches!(res, Err(LosslessError::HashMismatch { .. })));
    }

    #[test]
    fn test_verify_case_insensitivity() {
        // Arrange
        let expected = "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD";
        let mut cursor = Cursor::new(b"abc");

        // Act & Assert
        assert!(verify_reader(&mut cursor, expected).is_ok());
    }

    #[test]
    fn test_streaming_hasher_counter() {
        // Arrange
        let mut hasher = StreamingHasher::new();

        // Act
        hasher.update(b"12345");
        hasher.update(b"67890");

        // Assert
        assert_eq!(hasher.bytes_processed(), 10);
    }

    #[test]
    fn test_verify_invalid_hex_length() {
        // Arrange
        let mut cursor = Cursor::new(b"test");
        let invalid_short_hash = "abcd1234";

        // Act
        let res = verify_reader(&mut cursor, invalid_short_hash);

        // Assert
        assert!(matches!(res, Err(LosslessError::HashMismatch { .. })));
    }

    #[test]
    fn test_large_stream_sha256() {
        // Arrange: 1 MB stream of repeating pattern
        let pattern = b"LosslessDropBitForBitVerificationPattern";
        let repeat_count = (1024 * 1024) / pattern.len();
        let mut big_data = Vec::with_capacity(repeat_count * pattern.len());
        for _ in 0..repeat_count {
            big_data.extend_from_slice(pattern);
        }

        // Expected hash computed via one-shot
        let expected_hash = hash_bytes(&big_data);

        // Act: Stream through reader
        let mut cursor = Cursor::new(&big_data);
        let streamed_hash = hash_reader(&mut cursor).expect("streaming succeeds");

        // Assert
        assert_eq!(streamed_hash, expected_hash);
    }
}
