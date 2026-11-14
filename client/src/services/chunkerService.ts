export const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KB per WebRTC standard
export const HEADER_SIZE = 4; // 4 bytes for 32-bit unsigned chunk index

export function calculateTotalChunks(fileSize: number, chunkSize = DEFAULT_CHUNK_SIZE): number {
  if (fileSize <= 0) return 1;
  return Math.ceil(fileSize / chunkSize);
}

/**
 * Prepend 4-byte chunk index Big-Endian to chunk payload
 */
export function packChunkHeader(chunkIndex: number, payload: ArrayBuffer): ArrayBuffer {
  const packed = new Uint8Array(HEADER_SIZE + payload.byteLength);
  const view = new DataView(packed.buffer);
  view.setUint32(0, chunkIndex, false); // Big-Endian
  packed.set(new Uint8Array(payload), HEADER_SIZE);
  return packed.buffer;
}

/**
 * Extract 4-byte chunk index and raw payload slice
 */
export function unpackChunkHeader(packedBuffer: ArrayBuffer): {
  chunkIndex: number;
  payload: ArrayBuffer;
} {
  const view = new DataView(packedBuffer);
  const chunkIndex = view.getUint32(0, false);
  const payload = packedBuffer.slice(HEADER_SIZE);
  return { chunkIndex, payload };
}
