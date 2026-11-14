use crate::buffer::SecureBuffer;
use crate::chunker::pack_chunk;
use crate::error::Result;
use crate::hasher::{hash_bytes, hash_file};
use crate::protocol::{calculate_total_chunks, DEFAULT_CHUNK_SIZE, HEADER_SIZE};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::Path;

/// Individual file result from batch hashing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchHashEntry {
    #[serde(alias = "path")]
    pub file: String,
    pub sha256: String,
    pub size_bytes: u64,
}

/// High-performance multi-file streaming bit-for-bit SHA-256 hasher.
///
/// Adheres strictly to the zero-persistence policy by computing hashes
/// on stream/memory slices and using zeroized buffers for intermediate reads.
#[derive(Debug, Default, Clone, Copy)]
pub struct BatchHasher;

impl BatchHasher {
    /// Creates a new `BatchHasher`.
    pub fn new() -> Self {
        Self
    }

    /// Computes streaming bit-for-bit SHA-256 digests for a list of file paths.
    pub fn hash_files<P: AsRef<Path>, I: IntoIterator<Item = P>>(
        paths: I,
    ) -> Result<Vec<BatchHashEntry>> {
        let mut results = Vec::new();
        for path in paths {
            let path_ref = path.as_ref();
            let metadata = fs::metadata(path_ref)?;
            let sha256 = hash_file(path_ref)?;
            results.push(BatchHashEntry {
                file: path_ref.to_string_lossy().to_string(),
                sha256,
                size_bytes: metadata.len(),
            });
        }
        Ok(results)
    }

    /// Computes bit-for-bit SHA-256 digests for multiple named in-memory byte slices.
    pub fn hash_slices<'a, I: IntoIterator<Item = (&'a str, &'a [u8])>>(
        items: I,
    ) -> Vec<BatchHashEntry> {
        let mut results = Vec::new();
        for (name, slice) in items {
            let sha256 = hash_bytes(slice);
            results.push(BatchHashEntry {
                file: name.to_string(),
                sha256,
                size_bytes: slice.len() as u64,
            });
        }
        results
    }
}

/// A chunk produced by `MultiFileSlicer`, tagged with `file_index` and `file_id`.
///
/// The inner `packed_chunk` is a `SecureBuffer` containing:
/// `[4-byte big-endian sequence index][chunk payload]`
/// and is wiped with zeroes when dropped.
#[derive(Clone, PartialEq, Eq)]
pub struct MultiFileChunk {
    pub file_index: u32,
    pub file_id: String,
    pub chunk_index: u32,
    pub total_chunks: u32,
    pub packed_chunk: SecureBuffer,
}

impl std::fmt::Debug for MultiFileChunk {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MultiFileChunk")
            .field("file_index", &self.file_index)
            .field("file_id", &self.file_id)
            .field("chunk_index", &self.chunk_index)
            .field("total_chunks", &self.total_chunks)
            .field("packed_len", &self.packed_chunk.len())
            .field("payload", &"<zeroized-memory>")
            .finish()
    }
}

impl MultiFileChunk {
    /// Returns the raw chunk payload slice (excluding the 4-byte header).
    #[inline]
    pub fn payload(&self) -> &[u8] {
        if self.packed_chunk.len() >= HEADER_SIZE {
            &self.packed_chunk[HEADER_SIZE..]
        } else {
            &[]
        }
    }

    /// Returns the 4-byte big-endian sequence index header slice.
    #[inline]
    pub fn header(&self) -> &[u8] {
        if self.packed_chunk.len() >= HEADER_SIZE {
            &self.packed_chunk[..HEADER_SIZE]
        } else {
            &[]
        }
    }
}

/// Summary report for a single file in a batch slice operation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchFileSummary {
    pub file_index: u32,
    pub file_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub total_chunks: u32,
    pub sha256: String,
}

/// Overall report returned by batch slice operations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSliceReport {
    pub total_files: usize,
    pub total_chunks: u32,
    pub total_bytes: u64,
    pub files: Vec<BatchFileSummary>,
}

/// Zero-copy, zero-persistence multi-file chunk slicer.
///
/// Slices multiple files tagged with `file_index` and `file_id` into 64KB chunks
/// with 4-byte big-endian sequence index headers matching the WebRTC protocol.
#[derive(Debug, Clone)]
pub struct MultiFileSlicer {
    chunk_size: usize,
}

impl Default for MultiFileSlicer {
    fn default() -> Self {
        Self::new(DEFAULT_CHUNK_SIZE)
    }
}

impl MultiFileSlicer {
    /// Creates a new `MultiFileSlicer` with the specified chunk size (defaults to 64KB).
    pub fn new(chunk_size: usize) -> Self {
        Self {
            chunk_size: if chunk_size == 0 {
                DEFAULT_CHUNK_SIZE
            } else {
                chunk_size
            },
        }
    }

    /// Configured chunk payload size.
    pub fn chunk_size(&self) -> usize {
        self.chunk_size
    }

    /// Slices an in-memory batch of files tagged with `(file_index, file_id, data)`.
    pub fn slice_memory_batch(
        &self,
        files: &[(u32, String, &[u8])],
    ) -> Vec<MultiFileChunk> {
        let mut chunks = Vec::new();

        for &(file_index, ref file_id, data) in files {
            let total_chunks = calculate_total_chunks(data.len() as u64, self.chunk_size);

            if data.is_empty() {
                // Empty file produces 1 chunk of 0 bytes at chunk_index 0
                let packed = pack_chunk(0, &[]);
                chunks.push(MultiFileChunk {
                    file_index,
                    file_id: file_id.clone(),
                    chunk_index: 0,
                    total_chunks,
                    packed_chunk: packed,
                });
                continue;
            }

            let mut offset = 0;
            let mut chunk_index = 0u32;

            while offset < data.len() {
                let remaining = data.len() - offset;
                let slice_len = remaining.min(self.chunk_size);
                let slice = &data[offset..offset + slice_len];

                let packed = pack_chunk(chunk_index, slice);
                chunks.push(MultiFileChunk {
                    file_index,
                    file_id: file_id.clone(),
                    chunk_index,
                    total_chunks,
                    packed_chunk: packed,
                });

                offset += slice_len;
                chunk_index += 1;
            }
        }

        chunks
    }

    /// Slices a single file on disk tagged with `file_index` and `file_id`.
    ///
    /// Reads streamingly with `SecureBuffer` intermediate memory to ensure zero retention.
    pub fn slice_file<P: AsRef<Path>>(
        &self,
        file_index: u32,
        file_id: impl Into<String>,
        path: P,
    ) -> Result<Vec<MultiFileChunk>> {
        let path_ref = path.as_ref();
        let file = File::open(path_ref)?;
        let metadata = file.metadata()?;
        let file_size = metadata.len();
        let total_chunks = calculate_total_chunks(file_size, self.chunk_size);
        let file_id_str = file_id.into();

        let mut reader = BufReader::with_capacity(self.chunk_size, file);
        let mut chunks = Vec::with_capacity(total_chunks as usize);
        let mut chunk_index = 0u32;
        let mut temp_buf = SecureBuffer::zeroed(self.chunk_size);

        if file_size == 0 {
            let packed = pack_chunk(0, &[]);
            chunks.push(MultiFileChunk {
                file_index,
                file_id: file_id_str,
                chunk_index: 0,
                total_chunks,
                packed_chunk: packed,
            });
            return Ok(chunks);
        }

        loop {
            let mut bytes_read = 0;
            while bytes_read < self.chunk_size {
                let n = reader.read(&mut temp_buf[bytes_read..])?;
                if n == 0 {
                    break;
                }
                bytes_read += n;
            }

            if bytes_read == 0 {
                break;
            }

            let packed = pack_chunk(chunk_index, &temp_buf[..bytes_read]);
            chunks.push(MultiFileChunk {
                file_index,
                file_id: file_id_str.clone(),
                chunk_index,
                total_chunks,
                packed_chunk: packed,
            });

            chunk_index += 1;
            if bytes_read < self.chunk_size {
                break;
            }
        }

        Ok(chunks)
    }

    /// Slices multiple files on disk, automatically assigning sequence `file_index` (0, 1, 2...).
    pub fn slice_files<P: AsRef<Path>>(
        &self,
        paths: &[P],
    ) -> Result<Vec<MultiFileChunk>> {
        let mut all_chunks = Vec::new();
        for (i, p) in paths.iter().enumerate() {
            let file_index = i as u32;
            let file_id = format!("file_{}", file_index);
            let file_chunks = self.slice_file(file_index, file_id, p)?;
            all_chunks.extend(file_chunks);
        }
        Ok(all_chunks)
    }

    /// Slices multiple files and writes each chunk to `output_dir`
    /// named as `file_{file_index}_{safe_name}.{chunk_index}`.
    ///
    /// Generates and returns a comprehensive `BatchSliceReport`.
    pub fn slice_files_to_dir<P: AsRef<Path>, O: AsRef<Path>>(
        &self,
        paths: &[P],
        output_dir: O,
    ) -> Result<BatchSliceReport> {
        let out_dir_ref = output_dir.as_ref();
        fs::create_dir_all(out_dir_ref)?;

        let mut file_summaries = Vec::with_capacity(paths.len());
        let mut total_chunks_count = 0u32;
        let mut total_bytes_count = 0u64;

        for (i, p) in paths.iter().enumerate() {
            let path_ref = p.as_ref();
            let file_index = i as u32;
            let file_name = path_ref
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("file_{}", file_index));

            // Generate clean safe identifier
            let file_id = format!("file_{}", file_index);
            let sha256 = hash_file(path_ref)?;
            let file_chunks = self.slice_file(file_index, &file_id, path_ref)?;

            let file_size: u64 = file_chunks
                .iter()
                .map(|c| c.payload().len() as u64)
                .sum();
            let total_chunks = file_chunks.len() as u32;

            for chunk in file_chunks {
                let chunk_filename = format!(
                    "file_{}_{}.{}",
                    chunk.file_index, file_name, chunk.chunk_index
                );
                let chunk_path = out_dir_ref.join(chunk_filename);
                fs::write(&chunk_path, &chunk.packed_chunk)?;
                total_chunks_count += 1;
            }

            total_bytes_count += file_size;
            file_summaries.push(BatchFileSummary {
                file_index,
                file_id,
                file_name,
                file_size,
                total_chunks,
                sha256,
            });
        }

        Ok(BatchSliceReport {
            total_files: paths.len(),
            total_chunks: total_chunks_count,
            total_bytes: total_bytes_count,
            files: file_summaries,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_batch_hasher_memory_slices() {
        // Arrange
        let items = [
            ("alpha.txt", &b"first alpha content"[..]),
            ("beta.txt", &b"second beta content"[..]),
        ];

        // Act
        let results = BatchHasher::hash_slices(items);

        // Assert
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].file, "alpha.txt");
        assert_eq!(results[0].size_bytes, 19);
        assert_eq!(results[0].sha256, hash_bytes(b"first alpha content"));

        assert_eq!(results[1].file, "beta.txt");
        assert_eq!(results[1].size_bytes, 19);
        assert_eq!(results[1].sha256, hash_bytes(b"second beta content"));
    }

    #[test]
    fn test_batch_hasher_files() {
        // Arrange
        let dir = tempdir().expect("tempdir");
        let file1 = dir.path().join("f1.txt");
        let file2 = dir.path().join("f2.txt");

        fs::write(&file1, b"hello batch").expect("write f1");
        fs::write(&file2, b"world batch").expect("write f2");

        // Act
        let results = BatchHasher::hash_files(&[&file1, &file2]).expect("hash_files succeeds");

        // Assert
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].size_bytes, 11);
        assert_eq!(results[0].sha256, hash_bytes(b"hello batch"));
        assert_eq!(results[1].size_bytes, 11);
        assert_eq!(results[1].sha256, hash_bytes(b"world batch"));
    }

    #[test]
    fn test_batch_hasher_missing_file_fails() {
        // Arrange
        let missing = Path::new("/path/to/nonexistent/file.bin");

        // Act
        let res = BatchHasher::hash_files(&[missing]);

        // Assert
        assert!(res.is_err());
    }

    #[test]
    fn test_multifile_slicer_memory_batch() {
        // Arrange
        let slicer = MultiFileSlicer::new(32); // 32 byte chunks for test
        let file0_data = b"Short slice file 0";
        let file1_data = b"Somewhat longer slice file 1 with enough content to span multiple chunks!";

        let batch = [
            (0u32, "id-0".to_string(), &file0_data[..]),
            (1u32, "id-1".to_string(), &file1_data[..]),
        ];

        // Act
        let chunks = slicer.slice_memory_batch(&batch);

        // Assert
        // File 0: 18 bytes <= 32 -> 1 chunk
        assert_eq!(chunks[0].file_index, 0);
        assert_eq!(chunks[0].file_id, "id-0");
        assert_eq!(chunks[0].chunk_index, 0);
        assert_eq!(chunks[0].total_chunks, 1);
        assert_eq!(chunks[0].payload(), file0_data);
        assert_eq!(chunks[0].header(), &0u32.to_be_bytes());

        // File 1: 73 bytes / 32 -> 3 chunks (32, 32, 9)
        let f1_chunks: Vec<_> = chunks.iter().filter(|c| c.file_index == 1).collect();
        assert_eq!(f1_chunks.len(), 3);
        assert_eq!(f1_chunks[0].chunk_index, 0);
        assert_eq!(f1_chunks[0].payload().len(), 32);
        assert_eq!(f1_chunks[1].chunk_index, 1);
        assert_eq!(f1_chunks[1].payload().len(), 32);
        assert_eq!(f1_chunks[2].chunk_index, 2);
        assert_eq!(f1_chunks[2].payload().len(), 9);

        // Reconstructed payload matches
        let mut reconstructed = Vec::new();
        for c in f1_chunks {
            reconstructed.extend_from_slice(c.payload());
        }
        assert_eq!(reconstructed.as_slice(), file1_data);
    }

    #[test]
    fn test_multifile_slicer_empty_file() {
        // Arrange
        let slicer = MultiFileSlicer::default();
        let batch = [(0u32, "empty-file-id".to_string(), &b""[..])];

        // Act
        let chunks = slicer.slice_memory_batch(&batch);

        // Assert: Produces 1 chunk with 0-byte payload at chunk_index 0
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].chunk_index, 0);
        assert_eq!(chunks[0].total_chunks, 1);
        assert_eq!(chunks[0].payload().len(), 0);
        assert_eq!(chunks[0].header(), &0u32.to_be_bytes());
    }

    #[test]
    fn test_multifile_slicer_disk_files_and_dir() {
        // Arrange
        let dir = tempdir().expect("tempdir");
        let f1 = dir.path().join("doc1.txt");
        let f2 = dir.path().join("doc2.bin");
        let out_dir = dir.path().join("sliced_output");

        fs::write(&f1, b"doc 1 content for batch slicing").expect("write f1");
        fs::write(&f2, vec![0xEE; 100 * 1024]).expect("write f2 (100KB)");

        let slicer = MultiFileSlicer::new(DEFAULT_CHUNK_SIZE); // 64KB chunks

        // Act
        let report = slicer
            .slice_files_to_dir(&[&f1, &f2], &out_dir)
            .expect("slice_files_to_dir succeeds");

        // Assert report
        assert_eq!(report.total_files, 2);
        // f1: 1 chunk (31 bytes), f2: 2 chunks (64KB + 36KB) = 3 total chunks
        assert_eq!(report.total_chunks, 3);
        assert_eq!(report.files[0].total_chunks, 1);
        assert_eq!(report.files[1].total_chunks, 2);

        // Verify files were actually written to out_dir with valid headers
        let entries: Vec<_> = fs::read_dir(&out_dir)
            .expect("read_dir")
            .map(|e| e.unwrap().path())
            .collect();
        assert_eq!(entries.len(), 3);

        for path in entries {
            let data = fs::read(&path).expect("read chunk file");
            assert!(data.len() >= HEADER_SIZE);
            // Header must be valid u32 BE
            let index_bytes: [u8; 4] = data[..4].try_into().unwrap();
            let index = u32::from_be_bytes(index_bytes);
            assert!(index < 2); // 0 or 1
        }
    }

    #[test]
    fn test_zero_retention_debug_redacted() {
        // Arrange
        let chunk = MultiFileChunk {
            file_index: 2,
            file_id: "sec-id".to_string(),
            chunk_index: 0,
            total_chunks: 1,
            packed_chunk: pack_chunk(0, b"sensitive payload data"),
        };

        // Act
        let debug_str = format!("{:?}", chunk);

        // Assert
        assert!(!debug_str.contains("sensitive payload data"));
        assert!(debug_str.contains("zeroized-memory"));
    }
}
