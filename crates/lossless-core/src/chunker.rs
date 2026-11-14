use crate::buffer::SecureBuffer;
use crate::error::{LosslessError, Result};
use crate::protocol::{DEFAULT_CHUNK_SIZE, HEADER_SIZE};
use bytes::Bytes;
use std::io::{Read, Write};

/// A zero-copy borrowed view of a chunk.
///
/// Contains a 32-bit unsigned sequence index and a borrowed slice of the payload.
/// No heap allocation or payload copying occurs when creating or inspecting this view.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChunkView<'a> {
    pub index: u32,
    pub payload: &'a [u8],
}

impl<'a> ChunkView<'a> {
    /// Creates a new `ChunkView` referencing a payload slice.
    #[inline]
    pub const fn new(index: u32, payload: &'a [u8]) -> Self {
        Self { index, payload }
    }

    /// Unpacks a packed chunk (`[4-byte big-endian index][payload]`) zero-copy.
    ///
    /// Validates the header size without copying the underlying payload bytes.
    pub fn unpack(packed: &'a [u8]) -> Result<Self> {
        if packed.len() < HEADER_SIZE {
            return Err(LosslessError::InvalidChunkHeader {
                size: packed.len(),
                min_size: HEADER_SIZE,
            });
        }

        let (header, payload) = packed.split_at(HEADER_SIZE);
        let index_bytes: [u8; HEADER_SIZE] = header
            .try_into()
            .expect("header slice guaranteed to be HEADER_SIZE");
        let index = u32::from_be_bytes(index_bytes);

        if payload.len() > DEFAULT_CHUNK_SIZE {
            return Err(LosslessError::ChunkPayloadTooLarge {
                size: payload.len(),
                max_size: DEFAULT_CHUNK_SIZE,
            });
        }

        Ok(Self { index, payload })
    }

    /// Packs the chunk into a freshly allocated `SecureBuffer` (wiped on drop).
    pub fn pack(&self) -> SecureBuffer {
        let mut buf = SecureBuffer::with_capacity(HEADER_SIZE + self.payload.len());
        buf.extend_from_slice(&self.index.to_be_bytes());
        buf.extend_from_slice(self.payload);
        buf
    }

    /// Packs the chunk into an existing `SecureBuffer`, reusing its allocation.
    pub fn pack_into(&self, target: &mut SecureBuffer) {
        target.clear();
        target.reserve(HEADER_SIZE + self.payload.len());
        target.extend_from_slice(&self.index.to_be_bytes());
        target.extend_from_slice(self.payload);
    }

    /// Streams the packed chunk directly to an `io::Write` target zero-copy.
    pub fn write_to<W: Write>(&self, writer: &mut W) -> Result<usize> {
        writer.write_all(&self.index.to_be_bytes())?;
        writer.write_all(self.payload)?;
        Ok(HEADER_SIZE + self.payload.len())
    }

    /// Converts the borrowed payload into a shared `Bytes` buffer.
    pub fn to_bytes(&self) -> Bytes {
        Bytes::copy_from_slice(self.payload)
    }

    /// Unpacks a chunk from a `Bytes` reference zero-copy.
    pub fn unpack_bytes(bytes: &'a Bytes) -> Result<Self> {
        Self::unpack(bytes.as_ref())
    }
}

/// Zero-copy iterator that slices an in-memory byte buffer into WebRTC chunks.
#[derive(Debug, Clone)]
pub struct ZeroCopyChunkSlicer<'a> {
    data: &'a [u8],
    chunk_size: usize,
    current_index: u32,
    offset: usize,
    yielded_empty: bool,
}

impl<'a> ZeroCopyChunkSlicer<'a> {
    /// Creates a new zero-copy slicer over a byte slice.
    pub fn new(data: &'a [u8], chunk_size: usize) -> Self {
        Self {
            data,
            chunk_size: if chunk_size == 0 {
                DEFAULT_CHUNK_SIZE
            } else {
                chunk_size
            },
            current_index: 0,
            offset: 0,
            yielded_empty: false,
        }
    }

    /// Total chunks that will be produced.
    pub fn total_chunks(&self) -> u32 {
        crate::protocol::calculate_total_chunks(self.data.len() as u64, self.chunk_size)
    }
}

impl<'a> Iterator for ZeroCopyChunkSlicer<'a> {
    type Item = ChunkView<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.data.is_empty() {
            if !self.yielded_empty {
                self.yielded_empty = true;
                return Some(ChunkView::new(0, &[]));
            }
            return None;
        }

        if self.offset >= self.data.len() {
            return None;
        }

        let remaining = self.data.len() - self.offset;
        let slice_len = remaining.min(self.chunk_size);
        let payload = &self.data[self.offset..self.offset + slice_len];

        let chunk = ChunkView::new(self.current_index, payload);
        self.current_index += 1;
        self.offset += slice_len;

        Some(chunk)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let total = self.total_chunks() as usize;
        let current = self.current_index as usize;
        let remaining = total.saturating_sub(current);
        (remaining, Some(remaining))
    }
}

impl<'a> ExactSizeIterator for ZeroCopyChunkSlicer<'a> {}

/// Streaming chunker that slices any `io::Read` stream into packed WebRTC chunks
/// with strict zero-disk persistence and zeroized working memory.
pub struct StreamingChunker<R: Read> {
    reader: R,
    chunk_size: usize,
    current_index: u32,
    eof_reached: bool,
    yielded_empty: bool,
}

impl<R: Read> StreamingChunker<R> {
    /// Creates a new streaming chunker with standard 64KB chunk size.
    pub fn new(reader: R) -> Self {
        Self::with_chunk_size(reader, DEFAULT_CHUNK_SIZE)
    }

    /// Creates a streaming chunker with a custom chunk size.
    pub fn with_chunk_size(reader: R, chunk_size: usize) -> Self {
        Self {
            reader,
            chunk_size: if chunk_size == 0 {
                DEFAULT_CHUNK_SIZE
            } else {
                chunk_size
            },
            current_index: 0,
            eof_reached: false,
            yielded_empty: false,
        }
    }

    /// Reads the next chunk from the stream into `output_buffer`.
    ///
    /// The output buffer contains `[4-byte BE index][payload]`.
    /// Returns `Ok(Some(index))` on successful chunk read, or `Ok(None)` on EOF.
    pub fn read_next_chunk(&mut self, output_buffer: &mut SecureBuffer) -> Result<Option<u32>> {
        if self.eof_reached {
            return Ok(None);
        }

        output_buffer.clear();
        // Reserve header + chunk size
        output_buffer.reserve(HEADER_SIZE + self.chunk_size);
        output_buffer.extend_from_slice(&self.current_index.to_be_bytes());

        let mut read_bytes = 0;
        let mut temp_buf = [0u8; 8192];

        while read_bytes < self.chunk_size {
            let to_read = (self.chunk_size - read_bytes).min(temp_buf.len());
            let n = self.reader.read(&mut temp_buf[..to_read])?;
            if n == 0 {
                self.eof_reached = true;
                break;
            }
            output_buffer.extend_from_slice(&temp_buf[..n]);
            read_bytes += n;
        }

        // Handle empty stream edge case
        if read_bytes == 0 {
            if self.current_index == 0 && !self.yielded_empty {
                self.yielded_empty = true;
                self.eof_reached = true;
                let index = self.current_index;
                self.current_index += 1;
                return Ok(Some(index));
            }
            return Ok(None);
        }

        let index = self.current_index;
        self.current_index += 1;
        Ok(Some(index))
    }
}

/// Convenience function to create a zero-copy slicer over a byte slice.
pub fn slice_buffer(data: &[u8]) -> ZeroCopyChunkSlicer<'_> {
    ZeroCopyChunkSlicer::new(data, DEFAULT_CHUNK_SIZE)
}

/// Pack sequence index and payload into a `SecureBuffer`.
pub fn pack_chunk(index: u32, payload: &[u8]) -> SecureBuffer {
    ChunkView::new(index, payload).pack()
}

/// Unpack packed chunk bytes zero-copy into a `ChunkView`.
pub fn unpack_chunk(packed: &[u8]) -> Result<ChunkView<'_>> {
    ChunkView::unpack(packed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_pack_and_unpack_zero_copy() {
        // Arrange
        let payload = b"LosslessDrop WebRTC Chunk Test Payload";
        let index = 42u32;

        // Act
        let packed = pack_chunk(index, payload);
        let unpacked = unpack_chunk(&packed).expect("unpack succeeds");

        // Assert
        assert_eq!(unpacked.index, 42);
        assert_eq!(unpacked.payload, payload);
        // Verify big endian header format
        assert_eq!(&packed[..4], &42u32.to_be_bytes());
        assert_eq!(&packed[4..], payload);
    }

    #[test]
    fn test_large_chunk_index() {
        // Arrange
        let payload = b"Index 1,234,567 payload";
        let index = 1_234_567u32;

        // Act
        let packed = pack_chunk(index, payload);
        let unpacked = unpack_chunk(&packed).expect("unpack succeeds");

        // Assert
        assert_eq!(unpacked.index, index);
        assert_eq!(unpacked.payload, payload);
    }

    #[test]
    fn test_unpack_header_too_small() {
        // Arrange
        let tiny = [0u8, 1u8, 2u8]; // Only 3 bytes, header needs 4

        // Act
        let res = unpack_chunk(&tiny);

        // Assert
        assert!(matches!(res, Err(LosslessError::InvalidChunkHeader { .. })));
    }

    #[test]
    fn test_slicer_exact_multiple() {
        // Arrange: 2 full 64KB chunks = 128KB
        let data = vec![0xAA; DEFAULT_CHUNK_SIZE * 2];

        // Act
        let slicer = slice_buffer(&data);
        let chunks: Vec<ChunkView<'_>> = slicer.collect();

        // Assert
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].index, 0);
        assert_eq!(chunks[0].payload.len(), DEFAULT_CHUNK_SIZE);
        assert_eq!(chunks[1].index, 1);
        assert_eq!(chunks[1].payload.len(), DEFAULT_CHUNK_SIZE);
    }

    #[test]
    fn test_slicer_partial_chunk() {
        // Arrange: 64KB + 10 bytes = 2 chunks (one full, one 10 bytes)
        let total_size = DEFAULT_CHUNK_SIZE + 10;
        let data = vec![0xBB; total_size];

        // Act
        let slicer = slice_buffer(&data);
        let chunks: Vec<ChunkView<'_>> = slicer.collect();

        // Assert
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].payload.len(), DEFAULT_CHUNK_SIZE);
        assert_eq!(chunks[1].payload.len(), 10);
        assert_eq!(chunks[1].index, 1);
    }

    #[test]
    fn test_slicer_empty_buffer() {
        // Arrange
        let data = b"";

        // Act
        let slicer = slice_buffer(data);
        let chunks: Vec<ChunkView<'_>> = slicer.collect();

        // Assert: 1 empty chunk with index 0
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].index, 0);
        assert_eq!(chunks[0].payload.len(), 0);
    }

    #[test]
    fn test_streaming_chunker_roundtrip() {
        // Arrange
        let raw_data = b"Testing streaming chunker with arbitrary byte stream content.";
        let cursor = Cursor::new(raw_data);
        let mut chunker = StreamingChunker::with_chunk_size(cursor, 16);

        let mut output_buf = SecureBuffer::new();
        let mut collected_payload = Vec::new();

        // Act
        while let Some(index) = chunker.read_next_chunk(&mut output_buf).unwrap() {
            let view = unpack_chunk(&output_buf).unwrap();
            assert_eq!(view.index, index);
            collected_payload.extend_from_slice(view.payload);
        }

        // Assert
        assert_eq!(collected_payload, raw_data);
    }

    #[test]
    fn test_bytes_integration() {
        // Arrange
        let payload = b"bytes integration test payload";
        let packed = pack_chunk(7, payload);
        let shared_bytes = Bytes::copy_from_slice(&packed);

        // Act
        let unpacked = ChunkView::unpack_bytes(&shared_bytes).expect("unpacks from Bytes");
        let extracted_bytes = unpacked.to_bytes();

        // Assert
        assert_eq!(unpacked.index, 7);
        assert_eq!(extracted_bytes.as_ref(), payload);
    }

    #[test]
    fn test_unpack_payload_too_large() {
        // Arrange: 64KB + 1 byte payload packed
        let mut oversized = Vec::with_capacity(HEADER_SIZE + DEFAULT_CHUNK_SIZE + 1);
        oversized.extend_from_slice(&0u32.to_be_bytes());
        oversized.resize(HEADER_SIZE + DEFAULT_CHUNK_SIZE + 1, 0xAA);

        // Act
        let res = unpack_chunk(&oversized);

        // Assert
        assert!(matches!(
            res,
            Err(LosslessError::ChunkPayloadTooLarge { .. })
        ));
    }

    #[test]
    fn test_chunk_view_pack_into_and_write_to() {
        // Arrange
        let view = ChunkView::new(15, b"reusable test buffer payload");
        let mut target_buf = SecureBuffer::new();

        // Act
        view.pack_into(&mut target_buf);

        let mut stream_target = Vec::new();
        let bytes_written = view
            .write_to(&mut stream_target)
            .expect("write_to succeeds");

        // Assert
        assert_eq!(target_buf.as_slice(), stream_target.as_slice());
        assert_eq!(bytes_written, HEADER_SIZE + view.payload.len());
    }

    #[test]
    fn test_slicer_size_hint() {
        // Arrange: 3 full chunks
        let data = vec![0u8; DEFAULT_CHUNK_SIZE * 3];
        let mut slicer = slice_buffer(&data);

        // Act & Assert
        assert_eq!(slicer.size_hint(), (3, Some(3)));
        assert_eq!(slicer.len(), 3);

        slicer.next();
        assert_eq!(slicer.size_hint(), (2, Some(2)));
        assert_eq!(slicer.len(), 2);
    }
}
