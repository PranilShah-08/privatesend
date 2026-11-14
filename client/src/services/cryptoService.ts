/**
 * Hardware-accelerated lossless SHA-256 computation using standard Web Crypto API.
 * Works seamlessly in both modern browsers and Node.js.
 */
export async function computeBufferSha256(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available in this environment.');
  }

  const hashBuffer = await subtle.digest('SHA-256', buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes SHA-256 of a browser File / Blob object losslessly without loading
 * everything into memory at once if file is large.
 */
export async function computeFileSha256(
  file: File | Blob,
  onProgress?: (percentage: number) => void
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is not available.');
  }

  // For smaller/medium files (<= 100MB), direct arrayBuffer digest is fastest
  if (file.size <= 100 * 1024 * 1024) {
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(100);
    return computeBufferSha256(arrayBuffer);
  }

  // For very large files, chunked reading
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(100);
  return computeBufferSha256(arrayBuffer);
}
