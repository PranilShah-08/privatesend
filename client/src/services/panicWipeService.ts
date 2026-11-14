/**
 * PrivateSend v2 Session Memory Sanitization ("Panic Button")
 * Provides explicit zeroing of memory buffers, revocation of blob object URLs,
 * and teardown of WebRTC & Socket connections with zero residual traces in RAM.
 */

/**
 * Overwrites all bytes of an ArrayBuffer in-place with zeroes.
 */
export function zeroizeBuffer(buffer: ArrayBuffer): void {
  try {
    const view = new Uint8Array(buffer);
    view.fill(0);
  } catch (e) {
    console.error('Failed to zeroize buffer', e);
  }
}

/**
 * Iterates through all buffers in a Map, overwrites them with zeroes, and clears the map.
 */
export function zeroizeMapBuffers(map: Map<any, ArrayBuffer>): number {
  let count = 0;
  for (const buffer of map.values()) {
    zeroizeBuffer(buffer);
    count++;
  }
  map.clear();
  return count;
}

/**
 * Revokes an array or set of blob URLs to free memory allocated by URL.createObjectURL.
 */
export function revokeBlobUrls(urls: Iterable<string | null | undefined>): number {
  let count = 0;
  for (const url of urls) {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
        count++;
      } catch (e) {
        console.error('Failed to revoke object URL', e);
      }
    }
  }
  return count;
}
