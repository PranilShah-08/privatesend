use crate::buffer::SecureBuffer;
use crate::chunker::ChunkView;
use crate::error::{LosslessError, Result};
use std::collections::BTreeMap;
use std::io::Write;

/// Memory-resident, zero-persistence chunk reassembler.
///
/// Handles out-of-order chunk arrivals, validates indices, filters duplicate
/// chunks, and reconstructs the bit-for-bit original stream.
/// All stored buffers are wiped on drop.
#[derive(Default, Debug)]
pub struct ChunkReassembler {
    total_chunks: Option<u32>,
    chunks: BTreeMap<u32, SecureBuffer>,
    next_drain_index: u32,
    total_payload_bytes: usize,
}

impl ChunkReassembler {
    /// Creates a reassembler with unknown total chunks (will reassemble until final chunk known).
    pub fn new() -> Self {
        Self {
            total_chunks: None,
            chunks: BTreeMap::new(),
            next_drain_index: 0,
            total_payload_bytes: 0,
        }
    }

    /// Creates a reassembler with an expected total chunk count.
    pub fn with_total_chunks(total_chunks: u32) -> Self {
        Self {
            total_chunks: Some(total_chunks),
            chunks: BTreeMap::new(),
            next_drain_index: 0,
            total_payload_bytes: 0,
        }
    }

    /// Sets or updates the total chunks count.
    pub fn set_total_chunks(&mut self, total_chunks: u32) {
        self.total_chunks = Some(total_chunks);
    }

    /// Total chunks expected, if known.
    pub fn total_chunks(&self) -> Option<u32> {
        self.total_chunks
    }

    /// Number of distinct chunks received so far.
    pub fn received_count(&self) -> usize {
        self.chunks.len() + self.next_drain_index as usize
    }

    /// Inserts a chunk from a zero-copy `ChunkView`.
    pub fn add_chunk(&mut self, chunk: ChunkView<'_>) -> Result<bool> {
        if let Some(total) = self.total_chunks {
            if chunk.index >= total {
                return Err(LosslessError::ChunkIndexOutOfRange {
                    index: chunk.index,
                    total_chunks: total,
                });
            }
        }

        if chunk.index < self.next_drain_index || self.chunks.contains_key(&chunk.index) {
            // Duplicate chunk, ignore gracefully
            return Ok(false);
        }

        self.total_payload_bytes += chunk.payload.len();
        self.chunks
            .insert(chunk.index, SecureBuffer::from_slice(chunk.payload));
        Ok(true)
    }

    /// Inserts a raw packed chunk byte slice (`[4-byte BE index][payload]`).
    pub fn add_packed_chunk(&mut self, packed: &[u8]) -> Result<bool> {
        let view = ChunkView::unpack(packed)?;
        self.add_chunk(view)
    }

    /// Checks if all expected chunks have been received.
    pub fn is_complete(&self) -> bool {
        match self.total_chunks {
            Some(total) => {
                if total == 0 {
                    return true;
                }
                self.received_count() == total as usize
            }
            None => false,
        }
    }

    /// Returns list of missing chunk indices.
    pub fn missing_chunks(&self) -> Vec<u32> {
        let Some(total) = self.total_chunks else {
            return Vec::new();
        };

        let mut missing = Vec::new();
        for index in 0..total {
            if index < self.next_drain_index {
                continue;
            }
            if !self.chunks.contains_key(&index) {
                missing.push(index);
            }
        }
        missing
    }

    /// Drains contiguous in-order chunks directly to `writer`.
    ///
    /// Frees memory immediately upon write, adhering to the zero-retention policy
    /// and allowing streaming of multi-gigabyte files with constant memory footprint.
    pub fn drain_contiguous<W: Write>(&mut self, writer: &mut W) -> Result<usize> {
        let mut bytes_written = 0;

        while let Some(chunk_buf) = self.chunks.remove(&self.next_drain_index) {
            writer.write_all(&chunk_buf)?;
            bytes_written += chunk_buf.len();
            self.next_drain_index += 1;
        }

        Ok(bytes_written)
    }

    /// Reassembles the entire payload into a single `SecureBuffer`.
    /// Returns error if reassembly is incomplete.
    pub fn reassemble_into_buffer(mut self) -> Result<SecureBuffer> {
        if let Some(total) = self.total_chunks {
            let missing = self.missing_chunks();
            if !missing.is_empty() {
                return Err(LosslessError::MissingChunks {
                    missing_indices: missing,
                });
            }
            if total == 0 {
                return Ok(SecureBuffer::new());
            }
        }

        let mut out = SecureBuffer::with_capacity(self.total_payload_bytes);
        self.drain_contiguous(&mut out)?;

        if let Some(total) = self.total_chunks {
            if self.next_drain_index != total {
                return Err(LosslessError::IncompleteChunks {
                    received: self.next_drain_index as usize,
                    total,
                });
            }
        }

        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chunker::{pack_chunk, slice_buffer};

    #[test]
    fn test_reassembler_in_order() {
        // Arrange
        let original_data = b"Sequential in-order WebRTC streaming reassembly test.";
        let chunks: Vec<_> = slice_buffer(original_data).collect();
        let mut reassembler = ChunkReassembler::with_total_chunks(chunks.len() as u32);

        // Act
        for chunk in chunks {
            let added = reassembler.add_chunk(chunk).unwrap();
            assert!(added);
        }

        assert!(reassembler.is_complete());
        let reassembled = reassembler.reassemble_into_buffer().unwrap();

        // Assert
        assert_eq!(reassembled.as_slice(), original_data);
    }

    #[test]
    fn test_reassembler_out_of_order() {
        // Arrange
        let original_data = b"Out of order packets arriving over lossy WebRTC data channel!";
        let chunks: Vec<_> = slice_buffer(original_data).collect();
        assert_eq!(chunks.len(), 1);

        // Test with multiple smaller slices
        let part0 = pack_chunk(0, b"Part 0: ");
        let part1 = pack_chunk(1, b"Part 1: ");
        let part2 = pack_chunk(2, b"Part 2!");

        let mut reassembler = ChunkReassembler::with_total_chunks(3);

        // Act: Insert out-of-order: 2, 0, 1
        assert!(reassembler.add_packed_chunk(&part2).unwrap());
        assert!(!reassembler.is_complete());
        assert_eq!(reassembler.missing_chunks(), vec![0, 1]);

        assert!(reassembler.add_packed_chunk(&part0).unwrap());
        assert!(!reassembler.is_complete());
        assert_eq!(reassembler.missing_chunks(), vec![1]);

        assert!(reassembler.add_packed_chunk(&part1).unwrap());
        assert!(reassembler.is_complete());
        assert!(reassembler.missing_chunks().is_empty());

        let out = reassembler.reassemble_into_buffer().unwrap();

        // Assert
        assert_eq!(out.as_slice(), b"Part 0: Part 1: Part 2!");
    }

    #[test]
    fn test_duplicate_chunk_deduplication() {
        // Arrange
        let mut reassembler = ChunkReassembler::with_total_chunks(2);
        let chunk0 = pack_chunk(0, b"hello");

        // Act
        let first_add = reassembler.add_packed_chunk(&chunk0).unwrap();
        let second_add = reassembler.add_packed_chunk(&chunk0).unwrap();

        // Assert
        assert!(first_add);
        assert!(!second_add); // Duplicate ignored
    }

    #[test]
    fn test_out_of_range_chunk() {
        // Arrange
        let mut reassembler = ChunkReassembler::with_total_chunks(2);
        let chunk99 = pack_chunk(99, b"invalid");

        // Act
        let res = reassembler.add_packed_chunk(&chunk99);

        // Assert
        assert!(matches!(
            res,
            Err(LosslessError::ChunkIndexOutOfRange { .. })
        ));
    }

    #[test]
    fn test_drain_contiguous_streaming() {
        // Arrange
        let mut reassembler = ChunkReassembler::with_total_chunks(3);
        let chunk0 = pack_chunk(0, b"AAA");
        let chunk1 = pack_chunk(1, b"BBB");
        let chunk2 = pack_chunk(2, b"CCC");

        let mut stream_output = Vec::new();

        // Add 0 and 2
        reassembler.add_packed_chunk(&chunk0).unwrap();
        reassembler.add_packed_chunk(&chunk2).unwrap();

        // Drain: should only drain chunk 0 because chunk 1 is missing
        let n0 = reassembler.drain_contiguous(&mut stream_output).unwrap();
        assert_eq!(n0, 3);
        assert_eq!(stream_output, b"AAA");

        // Add missing chunk 1
        reassembler.add_packed_chunk(&chunk1).unwrap();

        // Drain again: should drain both chunk 1 and chunk 2
        let n1_2 = reassembler.drain_contiguous(&mut stream_output).unwrap();
        assert_eq!(n1_2, 6);
        assert_eq!(stream_output, b"AAABBBCCC");
        assert!(reassembler.is_complete());
    }

    #[test]
    fn test_reassembler_missing_chunks_fails() {
        // Arrange: Expected 3 chunks, only supply 0 and 2
        let mut reassembler = ChunkReassembler::with_total_chunks(3);
        reassembler.add_packed_chunk(&pack_chunk(0, b"A")).unwrap();
        reassembler.add_packed_chunk(&pack_chunk(2, b"C")).unwrap();

        // Act
        let res = reassembler.reassemble_into_buffer();

        // Assert
        assert!(
            matches!(res, Err(LosslessError::MissingChunks { missing_indices }) if missing_indices == vec![1])
        );
    }

    #[test]
    fn test_reassembler_empty_payload() {
        // Arrange
        let mut reassembler = ChunkReassembler::with_total_chunks(1);
        reassembler.add_packed_chunk(&pack_chunk(0, b"")).unwrap();

        // Act
        let out = reassembler.reassemble_into_buffer().unwrap();

        // Assert
        assert_eq!(out.len(), 0);
    }
}
