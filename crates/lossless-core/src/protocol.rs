use serde::{Deserialize, Serialize};

/// Standard WebRTC chunk payload size (64 KB).
pub const DEFAULT_CHUNK_SIZE: usize = 64 * 1024;

/// Size of the big-endian 32-bit chunk sequence index header in bytes.
pub const HEADER_SIZE: usize = 4;

/// Maximum total size of a packed chunk including the 4-byte header.
pub const MAX_PACKED_CHUNK_SIZE: usize = DEFAULT_CHUNK_SIZE + HEADER_SIZE;

/// Calculates total number of chunks for a given file size.
///
/// Follows the WebRTC protocol convention:
/// Empty files (0 bytes) produce 1 chunk (with 0 bytes payload).
#[inline]
pub fn calculate_total_chunks(file_size: u64, chunk_size: usize) -> u32 {
    if file_size == 0 {
        return 1;
    }
    let chunk_size = chunk_size as u64;
    file_size.div_ceil(chunk_size) as u32
}

/// Lossless transfer file manifest compatible with WebRTC signaling protocol.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileManifest {
    pub r#type: String,
    pub file_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub file_type: String,
    pub chunk_size: usize,
    pub total_chunks: u32,
    pub sha256: String,
}

impl FileManifest {
    /// Creates a new manifest with standard defaults.
    pub fn new(
        file_id: impl Into<String>,
        file_name: impl Into<String>,
        file_size: u64,
        file_type: impl Into<String>,
        sha256: impl Into<String>,
    ) -> Self {
        let chunk_size = DEFAULT_CHUNK_SIZE;
        let total_chunks = calculate_total_chunks(file_size, chunk_size);
        Self {
            r#type: "MANIFEST".to_string(),
            file_id: file_id.into(),
            file_name: file_name.into(),
            file_size,
            file_type: file_type.into(),
            chunk_size,
            total_chunks,
            sha256: sha256.into(),
        }
    }
}

/// Lossless transfer integrity verification report.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityReport {
    pub file_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub sender_sha256: String,
    pub receiver_sha256: String,
    pub is_match: bool,
    pub timestamp: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_total_chunks_boundary_cases() {
        // Arrange & Act & Assert
        // Empty file requires 1 chunk
        assert_eq!(calculate_total_chunks(0, DEFAULT_CHUNK_SIZE), 1);
        // Under 1 chunk
        assert_eq!(calculate_total_chunks(100, DEFAULT_CHUNK_SIZE), 1);
        // Exactly 1 chunk
        assert_eq!(
            calculate_total_chunks(DEFAULT_CHUNK_SIZE as u64, DEFAULT_CHUNK_SIZE),
            1
        );
        // 1 byte over 1 chunk -> 2 chunks
        assert_eq!(
            calculate_total_chunks(DEFAULT_CHUNK_SIZE as u64 + 1, DEFAULT_CHUNK_SIZE),
            2
        );
        // 5 chunks
        assert_eq!(
            calculate_total_chunks(DEFAULT_CHUNK_SIZE as u64 * 5, DEFAULT_CHUNK_SIZE),
            5
        );
    }

    #[test]
    fn test_file_manifest_serialization() {
        // Arrange
        let manifest = FileManifest::new(
            "file-123",
            "sample.bin",
            128 * 1024,
            "application/octet-stream",
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );

        // Act
        let serialized = serde_json::to_string(&manifest).expect("serialization succeeds");
        let deserialized: FileManifest =
            serde_json::from_str(&serialized).expect("deserialization succeeds");

        // Assert
        assert_eq!(manifest, deserialized);
        assert_eq!(deserialized.total_chunks, 2);
        assert_eq!(deserialized.r#type, "MANIFEST");
    }

    #[test]
    fn test_integrity_report_match_flag() {
        // Arrange
        let hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        let report = IntegrityReport {
            file_id: "test-id".to_string(),
            file_name: "test.txt".to_string(),
            file_size: 10,
            sender_sha256: hash.to_string(),
            receiver_sha256: hash.to_string(),
            is_match: true,
            timestamp: 1700000000,
        };

        // Act
        let json = serde_json::to_string(&report).expect("json serializes");

        // Assert
        assert!(json.contains("\"isMatch\":true"));
    }
}
