import { describe, it, expect } from 'vitest';
import {
  packChunkHeader,
  unpackChunkHeader,
  packBatchChunkHeader,
  unpackBatchChunkHeader,
  calculateTotalChunks,
  DEFAULT_CHUNK_SIZE,
} from '../src/services/chunkerService.js';

describe('chunkerService', () => {
  it('calculates total chunks correctly', () => {
    expect(calculateTotalChunks(0, DEFAULT_CHUNK_SIZE)).toBe(1);
    expect(calculateTotalChunks(100, DEFAULT_CHUNK_SIZE)).toBe(1);
    expect(calculateTotalChunks(DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_SIZE)).toBe(1);
    expect(calculateTotalChunks(DEFAULT_CHUNK_SIZE + 1, DEFAULT_CHUNK_SIZE)).toBe(2);
    expect(calculateTotalChunks(DEFAULT_CHUNK_SIZE * 5, DEFAULT_CHUNK_SIZE)).toBe(5);
  });

  it('packs and unpacks 4-byte chunk index correctly', () => {
    const rawPayload = new Uint8Array([10, 20, 30, 40, 50]);
    const chunkIndex = 42;

    const packed = packChunkHeader(chunkIndex, rawPayload.buffer);
    const unpacked = unpackChunkHeader(packed);

    expect(unpacked.chunkIndex).toBe(chunkIndex);
    expect(new Uint8Array(unpacked.payload)).toEqual(rawPayload);
  });

  it('handles large chunk indices up to millions', () => {
    const rawPayload = new Uint8Array([1, 2, 3]);
    const chunkIndex = 1_234_567;

    const packed = packChunkHeader(chunkIndex, rawPayload.buffer);
    const unpacked = unpackChunkHeader(packed);

    expect(unpacked.chunkIndex).toBe(chunkIndex);
  });

  it('packs and unpacks 8-byte batch headers with fileIndex and chunkIndex', () => {
    const rawPayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const fileIndex = 5;
    const chunkIndex = 99;

    const packed = packBatchChunkHeader(fileIndex, chunkIndex, rawPayload.buffer);
    const unpacked = unpackBatchChunkHeader(packed);

    expect(unpacked.fileIndex).toBe(fileIndex);
    expect(unpacked.chunkIndex).toBe(chunkIndex);
    expect(new Uint8Array(unpacked.payload)).toEqual(rawPayload);
  });
});
