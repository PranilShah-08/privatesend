export interface TraversedFile {
  file: File;
  relativePath: string;
}

/**
 * Normalizes relative path by converting Windows backslashes to forward slashes,
 * stripping leading/trailing slashes, and removing '.' and '..' segments to protect
 * against Zip Slip and directory traversal.
 */
export function normalizeRelativePath(path: string): string {
  const raw = (path || '').replace(/\\+/g, '/');
  const segments = raw.split('/').filter((s) => s && s !== '.' && s !== '..');
  return segments.join('/');
}

/**
 * Extracts files and relative paths from an HTML file input element (supports webkitdirectory).
 */
export function extractFilesFromFolderInput(files: FileList | File[]): TraversedFile[] {
  const result: TraversedFile[] = [];
  const list = Array.from(files);

  for (const file of list) {
    const rawPath = (file as any).webkitRelativePath || file.name;
    result.push({
      file,
      relativePath: normalizeRelativePath(rawPath),
    });
  }

  return result;
}

/**
 * Reads all entries from a FileSystemDirectoryReader, handling pagination in batches.
 */
export async function readDirectoryEntries(reader: any): Promise<any[]> {
  const allEntries: any[] = [];

  const readBatch = (): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      reader.readEntries((entries: any[]) => resolve(entries), reject);
    });
  };

  let batch = await readBatch();
  while (batch.length > 0) {
    allEntries.push(...batch);
    batch = await readBatch();
  }

  return allEntries;
}

/**
 * Recursively traverses a FileSystemEntry (file or directory) from drag-and-drop.
 */
export async function traverseFileSystemEntry(
  entry: any,
  basePath = ''
): Promise<TraversedFile[]> {
  if (!entry) return [];

  const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;

  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file: File) => {
          resolve([
            {
              file,
              relativePath: normalizeRelativePath(currentPath),
            },
          ]);
        },
        () => resolve([])
      );
    });
  }

  if (entry.isDirectory) {
    try {
      const dirReader = entry.createReader();
      const entries = await readDirectoryEntries(dirReader);
      const subResults = await Promise.all(
        entries.map((child: any) => traverseFileSystemEntry(child, currentPath))
      );
      return subResults.flat();
    } catch (e) {
      console.error('Failed to read directory entry', e);
      return [];
    }
  }

  return [];
}
