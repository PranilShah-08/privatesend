import { describe, it, expect } from 'vitest';
import { createInMemoryZip, formatZipFileName } from '../src/services/zipBundleService.js';
import { unzipSync } from 'fflate';

describe('zipBundleService', () => {
  it('formats zip file names cleanly', () => {
    expect(formatZipFileName('my-project')).toBe('my-project.zip');
    expect(formatZipFileName('')).toBe('privatesend-folder.zip');
    expect(formatZipFileName(undefined)).toBe('privatesend-folder.zip');
  });

  it('compresses files in-memory into a valid ZIP blob with directory structure', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const file1Data = encoder.encode('console.log("hello world");').buffer;
    const file2Data = encoder.encode('# Documentation\nProject docs').buffer;

    const files = [
      { relativePath: 'src/index.ts', buffer: file1Data },
      { relativePath: 'docs/README.md', buffer: file2Data },
    ];

    const zipBlob = createInMemoryZip(files);
    expect(zipBlob.type).toBe('application/zip');
    expect(zipBlob.size).toBeGreaterThan(0);

    // Verify unzipping matches original paths and contents
    const zipArrayBuffer = await zipBlob.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(zipArrayBuffer));

    expect(unzipped['src/index.ts']).toBeDefined();
    expect(unzipped['docs/README.md']).toBeDefined();

    expect(decoder.decode(unzipped['src/index.ts'])).toBe('console.log("hello world");');
    expect(decoder.decode(unzipped['docs/README.md'])).toBe('# Documentation\nProject docs');
  });
});
