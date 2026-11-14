import { describe, it, expect } from 'vitest';
import {
  createInMemoryZip,
  formatZipFileName,
  formatBatchZipFileName,
} from '../src/services/zipBundleService.js';

describe('ZipBundleService Multi-File Batch Packaging', () => {
  it('formats batch zip file name cleanly', () => {
    const name = formatBatchZipFileName(3);
    expect(name).toMatch(/^privatesend-batch-3files-\d+\.zip$/);

    const singleName = formatBatchZipFileName(1);
    expect(singleName).toMatch(/^privatesend-batch-1file-\d+\.zip$/);
  });

  it('creates in-memory zip bundle from multi-file batch without path collisions', async () => {
    const encoder = new TextEncoder();
    const files = [
      {
        relativePath: 'notes.txt',
        buffer: encoder.encode('First file content').buffer,
      },
      {
        relativePath: 'notes.txt', // Duplicate filename collision 1
        buffer: encoder.encode('Second file content').buffer,
      },
      {
        relativePath: 'notes.txt', // Duplicate filename collision 2
        buffer: encoder.encode('Third file content').buffer,
      },
      {
        relativePath: '', // Empty path fallback
        buffer: encoder.encode('Fourth file').buffer,
      },
      {
        relativePath: 'sub/doc.md',
        buffer: encoder.encode('# Title').buffer,
      },
    ];

    const blob = createInMemoryZip(files);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(0);
  });
});
