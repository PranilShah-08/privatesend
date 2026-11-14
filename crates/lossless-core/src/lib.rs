//! # LosslessCore
//!
//! High-performance, streaming bit-for-bit SHA-256 verifier and zero-copy
//! WebRTC chunk slicer/reassembler for LosslessDrop.
//!
//! ## Design Principles
//! - **Bit-for-Bit Fidelity**: Hardware-accelerated streaming SHA-256 validation.
//! - **Zero Persistence**: Strictly operates on memory streams / stdin-stdout.
//!   Zero disk caching, zero persistent storage traces.
//! - **Buffer Zeroization**: All memory allocations holding chunk or file data
//!   are securely wiped with zeroes upon `Drop`.
//! - **Zero-Copy Architecture**: Chunk slicing and header extraction borrow
//!   slices directly without copying buffers.

pub mod buffer;
pub mod chunker;
pub mod error;
pub mod hasher;
pub mod protocol;
pub mod reassembler;

pub use buffer::SecureBuffer;
pub use chunker::{
    pack_chunk, slice_buffer, unpack_chunk, ChunkView, StreamingChunker, ZeroCopyChunkSlicer,
};
pub use error::{LosslessError, Result};
pub use hasher::{hash_bytes, hash_file, hash_reader, verify_file, verify_reader, StreamingHasher};
pub use protocol::{
    calculate_total_chunks, FileManifest, IntegrityReport, DEFAULT_CHUNK_SIZE, HEADER_SIZE,
    MAX_PACKED_CHUNK_SIZE,
};
pub use reassembler::ChunkReassembler;
