/**
 * PrivateSend v2 End-to-End Encryption Service
 * Implements hardware-accelerated AES-256-GCM encryption with PBKDF2 key derivation
 * using the standard Web Crypto API (crypto.subtle).
 * Zero key retention in persistent storage.
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;
const IV_LENGTH_BYTES = 12; // 96-bit IV recommended for AES-GCM
const SALT_LENGTH_BYTES = 16;

export const DEFAULT_SALT = new Uint8Array([
  0x70, 0x72, 0x69, 0x76, 0x61, 0x74, 0x65, 0x73, 0x65, 0x6e, 0x64, 0x2d, 0x73, 0x61, 0x6c, 0x74,
]); // "privatesend-salt" (16 bytes)

export function getChunkIv(chunkIndex: number, fileIndex = 0, batchNonce = 0): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH_BYTES);
  const view = new DataView(iv.buffer);
  view.setUint32(0, batchNonce, false);
  view.setUint32(4, fileIndex, false);
  view.setUint32(8, chunkIndex, false);
  return iv;
}

export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_LENGTH_BYTES);
  globalThis.crypto.getRandomValues(salt);
  return salt;
}

export function generateIv(): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH_BYTES);
  globalThis.crypto.getRandomValues(iv);
  return iv;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Derives an AES-GCM 256-bit key from the room code using PBKDF2.
 */
export async function deriveKeyFromRoomCode(
  roomCode: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is not available in this environment.');
  }

  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(roomCode.replace(/\D/g, ''));

  // Import raw password as key material
  const baseKey = await subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key with 100,000 iterations of SHA-256
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH_BITS,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an ArrayBuffer payload using AES-256-GCM.
 */
export async function encryptPayload(
  data: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is not available.');
  }

  return subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as ArrayBuffer,
    },
    key,
    data
  );
}

/**
 * Decrypts an AES-256-GCM encrypted ArrayBuffer payload.
 * Throws an error if authentication tag check fails (tampered data).
 */
export async function decryptPayload(
  cipherData: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is not available.');
  }

  return subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as ArrayBuffer,
    },
    key,
    cipherData
  );
}
