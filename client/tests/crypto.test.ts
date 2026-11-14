import { describe, it, expect } from 'vitest';
import { computeBufferSha256 } from '../src/services/cryptoService.js';

describe('cryptoService', () => {
  it('computes correct SHA-256 for string/buffer', async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode('LosslessDrop File Sharing Test Data');
    const hash = await computeBufferSha256(data);

    // Should be 64 hexadecimal characters
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    
    // Repeat to ensure deterministic hashing
    const hash2 = await computeBufferSha256(data);
    expect(hash).toBe(hash2);
  });

  it('computes known SHA-256 vector for empty buffer', async () => {
    const empty = new Uint8Array(0);
    const hash = await computeBufferSha256(empty);
    // Known SHA-256 of empty string: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
