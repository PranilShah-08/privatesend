import { zipSync } from 'fflate';

export interface ZipFileInput {
  relativePath: string;
  buffer: ArrayBuffer | Uint8Array;
}

/**
 * Creates an in-memory ZIP archive from an array of files with relative directory paths.
 * Runs completely in client RAM with zero disk persistence.
 */
export function createInMemoryZip(files: ZipFileInput[]): Blob {
  const zipData: Record<string, Uint8Array> = {};
  const seenPaths = new Set<string>();

  for (const f of files) {
    let cleanPath = f.relativePath
      .replace(/\\+/g, '/')
      .split('/')
      .filter((s) => s && s !== '.' && s !== '..')
      .join('/');

    if (!cleanPath) cleanPath = 'file';

    // Disambiguate path collisions
    if (seenPaths.has(cleanPath)) {
      let counter = 1;
      const dotIdx = cleanPath.lastIndexOf('.');
      const base = dotIdx !== -1 ? cleanPath.slice(0, dotIdx) : cleanPath;
      const ext = dotIdx !== -1 ? cleanPath.slice(dotIdx) : '';
      while (seenPaths.has(`${base} (${counter})${ext}`)) {
        counter++;
      }
      cleanPath = `${base} (${counter})${ext}`;
    }

    seenPaths.add(cleanPath);
    zipData[cleanPath] = f.buffer instanceof Uint8Array ? f.buffer : new Uint8Array(f.buffer);
  }

  const zipped = zipSync(zipData);
  return new Blob([zipped], { type: 'application/zip' });
}

export function formatZipFileName(rootFolderName?: string): string {
  if (!rootFolderName || !rootFolderName.trim()) {
    return 'privatesend-folder.zip';
  }
  const clean = rootFolderName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.endsWith('.zip') ? clean : `${clean}.zip`;
}

export function formatBatchZipFileName(count: number): string {
  const fileWord = count === 1 ? 'file' : 'files';
  return `privatesend-batch-${count}${fileWord}-${Date.now()}.zip`;
}
