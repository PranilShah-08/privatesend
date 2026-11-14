use std::io;
use thiserror::Error;

/// Errors that can occur within `lossless-core`.
#[derive(Error, Debug)]
pub enum LosslessError {
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),

    #[error("Hex decoding error: {0}")]
    Hex(#[from] hex::FromHexError),

    #[error("Hash verification mismatch: expected {expected}, calculated {calculated}")]
    HashMismatch {
        expected: String,
        calculated: String,
    },

    #[error(
        "Invalid chunk header: buffer too small ({size} bytes, expected at least {min_size} bytes)"
    )]
    InvalidChunkHeader { size: usize, min_size: usize },

    #[error("Chunk payload exceeds maximum size ({size} bytes > {max_size} bytes)")]
    ChunkPayloadTooLarge { size: usize, max_size: usize },

    #[error("Chunk sequence index {index} out of range (total chunks: {total_chunks})")]
    ChunkIndexOutOfRange { index: u32, total_chunks: u32 },

    #[error("Duplicate chunk received at index {index}")]
    DuplicateChunk { index: u32 },

    #[error("Incomplete chunk stream: received {received} of {total} chunks")]
    IncompleteChunks { received: usize, total: u32 },

    #[error("Missing chunks during reassembly: {missing_indices:?}")]
    MissingChunks { missing_indices: Vec<u32> },

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Convenience result alias for `lossless-core`.
pub type Result<T> = std::result::Result<T, LosslessError>;
