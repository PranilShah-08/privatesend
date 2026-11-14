import { describe, it, expect } from 'vitest';
import { zeroizeBuffer, zeroizeMapBuffers, revokeBlobUrls } from '../src/services/panicWipeService.js';

describe('PanicWipeService (v2 Memory Sanitization)', () => {
  it('zeroizes an ArrayBuffer in-place', () => {
    const buffer = new ArrayBuffer(8);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(Array.from(view)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    zeroizeBuffer(buffer);

    expect(Array.from(view)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('zeroizes all buffers stored in a Map and clears the map', () => {
    const map = new Map<number, ArrayBuffer>();
    const b1 = new Uint8Array([10, 20]).buffer;
    const b2 = new Uint8Array([30, 40]).buffer;

    map.set(0, b1);
    map.set(1, b2);

    zeroizeMapBuffers(map);

    expect(Array.from(new Uint8Array(b1))).toEqual([0, 0]);
    expect(Array.from(new Uint8Array(b2))).toEqual([0, 0]);
    expect(map.size).toBe(0);
  });

  it('safely revokes an array of blob URLs', () => {
    let revoked = 0;
    // Mock URL.revokeObjectURL
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = () => {
      revoked++;
    };

    try {
      const count = revokeBlobUrls(['blob:http://localhost/1', 'blob:http://localhost/2']);
      expect(count).toBe(2);
      expect(revoked).toBe(2);
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
