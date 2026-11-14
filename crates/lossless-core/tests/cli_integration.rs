use std::fs;
use std::process::Command;
use tempfile::tempdir;

#[test]
fn test_cli_hash_and_verify_roundtrip() {
    // Arrange
    let dir = tempdir().expect("tempdir created");
    let test_file = dir.path().join("source.dat");
    let sample_content = b"ZeroPersistenceLosslessDropBitForBitContent1234567890";
    fs::write(&test_file, sample_content).expect("test file written");

    // Act: Run hash
    let binary_path = env!("CARGO_BIN_EXE_lossless-core");
    let hash_output = Command::new(binary_path)
        .arg("hash")
        .arg(&test_file)
        .output()
        .expect("hash command executes");

    assert!(hash_output.status.success());
    let hash_str = String::from_utf8(hash_output.stdout)
        .expect("utf8 string")
        .trim()
        .to_string();

    assert_eq!(hash_str.len(), 64);

    // Act: Verify valid hash
    let verify_output = Command::new(binary_path)
        .arg("verify")
        .arg(&test_file)
        .arg(&hash_str)
        .output()
        .expect("verify command executes");

    // Assert
    assert!(verify_output.status.success());

    // Act: Verify invalid hash fails with exit code 1
    let fail_output = Command::new(binary_path)
        .arg("verify")
        .arg(&test_file)
        .arg("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
        .output()
        .expect("verify command executes");

    // Assert
    assert_eq!(fail_output.status.code(), Some(1));
}

#[test]
fn test_cli_chunk_and_reassemble_roundtrip() {
    // Arrange: Create 150 KB test file (requires 3 x 64KB chunks: 64KB, 64KB, 22KB)
    let dir = tempdir().expect("tempdir created");
    let test_file = dir.path().join("large_sample.bin");
    let chunk_prefix = dir.path().join("chunk_part");
    let reassembled_file = dir.path().join("reassembled.bin");

    let mut payload = Vec::with_capacity(150 * 1024);
    for i in 0..(150 * 1024) {
        payload.push((i % 256) as u8);
    }
    fs::write(&test_file, &payload).expect("payload written");

    let binary_path = env!("CARGO_BIN_EXE_lossless-core");

    // Act: Slice into chunks
    let chunk_output = Command::new(binary_path)
        .arg("chunk")
        .arg(&test_file)
        .arg(&chunk_prefix)
        .output()
        .expect("chunk command executes");

    assert!(chunk_output.status.success());

    // Verify 3 chunk files were created with 4-byte BE headers
    let chunk0 = fs::read(dir.path().join("chunk_part.0")).expect("chunk 0 exists");
    let chunk1 = fs::read(dir.path().join("chunk_part.1")).expect("chunk 1 exists");
    let chunk2 = fs::read(dir.path().join("chunk_part.2")).expect("chunk 2 exists");

    assert_eq!(chunk0.len(), 4 + 64 * 1024);
    assert_eq!(chunk1.len(), 4 + 64 * 1024);
    assert_eq!(chunk2.len(), 4 + (150 - 128) * 1024);

    // Verify 4-byte big-endian indices in headers
    assert_eq!(&chunk0[..4], &0u32.to_be_bytes());
    assert_eq!(&chunk1[..4], &1u32.to_be_bytes());
    assert_eq!(&chunk2[..4], &2u32.to_be_bytes());

    // Act: Reassemble chunks
    let reassemble_output = Command::new(binary_path)
        .arg("reassemble")
        .arg(&chunk_prefix)
        .arg("-o")
        .arg(&reassembled_file)
        .output()
        .expect("reassemble command executes");

    assert!(reassemble_output.status.success());

    // Assert: Bit-for-bit identity check
    let reassembled_data = fs::read(&reassembled_file).expect("read reassembled file");
    assert_eq!(reassembled_data, payload);

    // Verify SHA-256 match
    let hash_original = Command::new(binary_path)
        .arg("hash")
        .arg(&test_file)
        .output()
        .expect("hash original");
    let hash_reassembled = Command::new(binary_path)
        .arg("hash")
        .arg(&reassembled_file)
        .output()
        .expect("hash reassembled");

    assert_eq!(hash_original.stdout, hash_reassembled.stdout);
}
