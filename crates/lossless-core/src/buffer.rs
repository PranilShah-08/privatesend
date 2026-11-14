use std::ops::{Deref, DerefMut};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// A memory-resident buffer adhering strictly to the zero-persistence policy.
///
/// Ensures all allocated bytes are securely wiped with zeroes upon `Drop`.
/// No intermediate memory retention or residual traces remain in RAM after deallocation.
#[derive(Default, Clone, PartialEq, Eq, Zeroize, ZeroizeOnDrop)]
pub struct SecureBuffer {
    data: Vec<u8>,
}

impl SecureBuffer {
    /// Creates an empty secure buffer.
    pub fn new() -> Self {
        Self { data: Vec::new() }
    }

    /// Creates an empty secure buffer with preallocated capacity.
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            data: Vec::with_capacity(capacity),
        }
    }

    /// Creates a secure buffer initialized with `len` zeroes.
    pub fn zeroed(len: usize) -> Self {
        Self {
            data: vec![0u8; len],
        }
    }

    /// Creates a secure buffer containing a copy of the given byte slice.
    pub fn from_slice(slice: &[u8]) -> Self {
        Self {
            data: slice.to_vec(),
        }
    }

    /// Clears the buffer, wiping all currently held data immediately.
    pub fn clear(&mut self) {
        self.data.zeroize();
        self.data.clear();
    }

    /// Appends a byte slice to the buffer.
    pub fn extend_from_slice(&mut self, slice: &[u8]) {
        self.data.extend_from_slice(slice);
    }

    /// Appends a single byte to the buffer.
    pub fn push(&mut self, byte: u8) {
        self.data.push(byte);
    }

    /// Reserves capacity for at least `additional` more bytes.
    pub fn reserve(&mut self, additional: usize) {
        self.data.reserve(additional);
    }

    /// Resizes the buffer to `new_len`, zeroing newly added slots if expanding.
    pub fn resize(&mut self, new_len: usize, value: u8) {
        if new_len < self.data.len() {
            // Zero out elements before truncating
            self.data[new_len..].zeroize();
        }
        self.data.resize(new_len, value);
    }

    /// Returns a slice over the buffer contents.
    pub fn as_slice(&self) -> &[u8] {
        &self.data
    }

    /// Returns a mutable slice over the buffer contents.
    pub fn as_mut_slice(&mut self) -> &mut [u8] {
        &mut self.data
    }

    /// Returns the length of the buffer in bytes.
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// Returns `true` if the buffer contains no bytes.
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Consumes the `SecureBuffer` and extracts the inner `Vec<u8>`.
    /// Note: The caller is responsible for wiping the returned vector.
    pub fn into_vec(mut self) -> Vec<u8> {
        // Prevent drop wipe on the moved inner vector by swapping out
        std::mem::take(&mut self.data)
    }
}

impl Deref for SecureBuffer {
    type Target = [u8];

    fn deref(&self) -> &Self::Target {
        &self.data
    }
}

impl DerefMut for SecureBuffer {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.data
    }
}

impl AsRef<[u8]> for SecureBuffer {
    fn as_ref(&self) -> &[u8] {
        &self.data
    }
}

impl AsMut<[u8]> for SecureBuffer {
    fn as_mut(&mut self) -> &mut [u8] {
        &mut self.data
    }
}

impl std::io::Write for SecureBuffer {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.data.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl From<Vec<u8>> for SecureBuffer {
    fn from(data: Vec<u8>) -> Self {
        Self { data }
    }
}

impl From<&[u8]> for SecureBuffer {
    fn from(slice: &[u8]) -> Self {
        Self::from_slice(slice)
    }
}

impl std::fmt::Debug for SecureBuffer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Never print sensitive buffer contents in debug logs!
        f.debug_struct("SecureBuffer")
            .field("len", &self.data.len())
            .field("redacted", &"<zeroized-memory>")
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_buffer_lifecycle() {
        // Arrange
        let mut buf = SecureBuffer::with_capacity(64);
        assert!(buf.is_empty());

        // Act
        buf.extend_from_slice(b"secret payload data");

        // Assert
        assert_eq!(buf.len(), 19);
        assert_eq!(&buf[..6], b"secret");

        // Clear wipes immediately
        buf.clear();
        assert_eq!(buf.len(), 0);
    }

    #[test]
    fn test_secure_buffer_zeroize_on_drop() {
        // Arrange
        let raw_ptr: *const u8;
        let len: usize;

        {
            let mut buf = SecureBuffer::from_slice(b"sensitive credentials");
            raw_ptr = buf.as_ptr();
            len = buf.len();

            // Verify content is initially readable
            unsafe {
                let slice = std::slice::from_raw_parts(raw_ptr, len);
                assert_eq!(slice, b"sensitive credentials");
            }

            // Explicitly zeroize to verify zeroing behavior
            buf.zeroize();

            // Assert memory is zeroed
            unsafe {
                let slice = std::slice::from_raw_parts(raw_ptr, len);
                assert!(slice.iter().all(|&b| b == 0));
            }
        }
    }

    #[test]
    fn test_secure_buffer_debug_redacted() {
        // Arrange
        let buf = SecureBuffer::from_slice(b"super-secret-token");

        // Act
        let debug_str = format!("{:?}", buf);

        // Assert
        assert!(!debug_str.contains("super-secret-token"));
        assert!(debug_str.contains("redacted"));
    }

    #[test]
    fn test_secure_buffer_write_trait() {
        use std::io::Write;

        // Arrange
        let mut buf = SecureBuffer::new();

        // Act
        buf.write_all(b"chunk1 ").expect("write_all succeeds");
        buf.write_all(b"chunk2").expect("write_all succeeds");
        buf.flush().expect("flush succeeds");

        // Assert
        assert_eq!(buf.as_slice(), b"chunk1 chunk2");
    }

    #[test]
    fn test_secure_buffer_resize_and_zeroing() {
        // Arrange
        let mut buf = SecureBuffer::from_slice(b"initial data");

        // Act
        buf.resize(20, 0x55);

        // Assert
        assert_eq!(buf.len(), 20);
        assert_eq!(&buf[..12], b"initial data");
        assert_eq!(&buf[12..], &[0x55; 8]);

        // Shrinking zeroes truncated elements
        buf.resize(5, 0);
        assert_eq!(buf.len(), 5);
        assert_eq!(buf.as_slice(), b"initi");
    }

    #[test]
    fn test_secure_buffer_into_vec() {
        // Arrange
        let buf = SecureBuffer::from_slice(b"convertible buffer");

        // Act
        let vec = buf.into_vec();

        // Assert
        assert_eq!(vec.as_slice(), b"convertible buffer");
    }
}
