import { describe, it, expect } from 'vitest';
import {
  generateSalt,
  generateIv,
  getChunkIv,
  bytesToHex,
  hexToBytes,
  deriveKeyFromRoomCode,
  encryptPayload,
  decryptPayload,
} from '../src/services/encryptionService.js';

describe('EncryptionService (v2 AES-256-GCM)', () => {
  it('generates cryptographically random salt and IV of standard lengths', () => {
    const salt = generateSalt();
    const iv = generateIv();

    expect(salt.byteLength).toBe(16);
    expect(iv.byteLength).toBe(12);
  });

  it('performs lossless hex conversions', () => {
    const original = new Uint8Array([0, 15, 255, 128, 42]);
    const hex = bytesToHex(original);
    expect(hex).toBe('000fff802a');

    const recovered = hexToBytes(hex);
    expect(Array.from(recovered)).toEqual(Array.from(original));
  });

  it('encrypts and decrypts ArrayBuffer payloads losslessly using derived key', async () => {
    const roomCode = '482-194';
    const salt = generateSalt();
    const iv = generateIv();

    const key = await deriveKeyFromRoomCode(roomCode, salt);
    expect(key.algorithm.name).toBe('AES-GCM');

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const originalText = 'PrivateSend v2 Lossless Bit-for-Bit E2E Encrypted Payload!';
    const plainBuffer = encoder.encode(originalText).buffer;

    const cipherBuffer = await encryptPayload(plainBuffer, key, iv);
    expect(cipherBuffer.byteLength).toBeGreaterThan(plainBuffer.byteLength); // includes 16-byte auth tag

    const decryptedBuffer = await decryptPayload(cipherBuffer, key, iv);
    const recoveredText = decoder.decode(decryptedBuffer);

    expect(recoveredText).toBe(originalText);
  });

  it('rejects decryption when authentication tag or ciphertext is tampered', async () => {
    const roomCode = '999-111';
    const salt = generateSalt();
    const iv = generateIv();

    const key = await deriveKeyFromRoomCode(roomCode, salt);
    const plainBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;

    const cipherBuffer = await encryptPayload(plainBuffer, key, iv);
    const tampered = new Uint8Array(cipherBuffer.slice(0));
    tampered[0] ^= 0xff; // flip a bit

    await expect(decryptPayload(tampered.buffer, key, iv)).rejects.toThrow();
  });

  it('rejects decryption when derived with a different room code', async () => {
    const salt = generateSalt();
    const iv = generateIv();

    const senderKey = await deriveKeyFromRoomCode('123-456', salt);
    const wrongReceiverKey = await deriveKeyFromRoomCode('999-999', salt);

    const plainBuffer = new TextEncoder().encode('Secret message').buffer;
    const cipherBuffer = await encryptPayload(plainBuffer, senderKey, iv);

    await expect(decryptPayload(cipherBuffer, wrongReceiverKey, iv)).rejects.toThrow();
  });

  it('generates chunk IV with batch nonce, fileIndex, and chunkIndex', () => {
    const iv = getChunkIv(42, 3, 0x12345678);
    expect(iv.byteLength).toBe(12);
    const view = new DataView(iv.buffer);
    expect(view.getUint32(0, false)).toBe(0x12345678);
    expect(view.getUint32(4, false)).toBe(3);
    expect(view.getUint32(8, false)).toBe(42);
  });
});
