import { describe, it, expect } from 'vitest';
import {
  normalizeRelativePath,
  extractFilesFromFolderInput,
  traverseFileSystemEntry,
} from '../src/services/folderTraversalService.js';

describe('folderTraversalService', () => {
  it('normalizes relative paths across POSIX and Windows and prevents Zip Slip', () => {
    expect(normalizeRelativePath('/src/components/Header.tsx')).toBe('src/components/Header.tsx');
    expect(normalizeRelativePath('\\docs\\guide\\setup.md')).toBe('docs/guide/setup.md');
    expect(normalizeRelativePath('index.html')).toBe('index.html');
    expect(normalizeRelativePath('../../etc/passwd')).toBe('etc/passwd');
    expect(normalizeRelativePath('folder/../secret.txt')).toBe('folder/secret.txt');
  });

  it('extracts files from folder input with webkitRelativePath', () => {
    const mockFile1 = new File(['content1'], 'main.ts');
    Object.defineProperty(mockFile1, 'webkitRelativePath', {
      value: 'project/src/main.ts',
    });

    const mockFile2 = new File(['content2'], 'README.md');
    Object.defineProperty(mockFile2, 'webkitRelativePath', {
      value: 'project/README.md',
    });

    const extracted = extractFilesFromFolderInput([mockFile1, mockFile2]);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].relativePath).toBe('project/src/main.ts');
    expect(extracted[1].relativePath).toBe('project/README.md');
  });

  it('traverses mock FileSystemFileEntry correctly', async () => {
    const mockFile = new File(['hello'], 'test.txt');
    const mockFileEntry = {
      isFile: true,
      isDirectory: false,
      name: 'test.txt',
      file: (cb: (f: File) => void) => cb(mockFile),
    };

    const results = await traverseFileSystemEntry(mockFileEntry, 'folder');
    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('folder/test.txt');
    expect(results[0].file.name).toBe('test.txt');
  });

  it('traverses mock FileSystemDirectoryEntry recursively', async () => {
    const file1 = new File(['code'], 'index.ts');
    const childFileEntry = {
      isFile: true,
      isDirectory: false,
      name: 'index.ts',
      file: (cb: (f: File) => void) => cb(file1),
    };

    let readCount = 0;
    const mockDirReader = {
      readEntries: (cb: (entries: any[]) => void) => {
        if (readCount === 0) {
          readCount++;
          cb([childFileEntry]);
        } else {
          cb([]);
        }
      },
    };

    const mockDirEntry = {
      isFile: false,
      isDirectory: true,
      name: 'src',
      createReader: () => mockDirReader,
    };

    const results = await traverseFileSystemEntry(mockDirEntry, 'my-app');
    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('my-app/src/index.ts');
  });

  it('handles null entries, file read errors, and directory read errors gracefully', async () => {
    expect(await traverseFileSystemEntry(null)).toEqual([]);

    const failingFileEntry = {
      isFile: true,
      isDirectory: false,
      name: 'broken.bin',
      file: (_cb: any, errCb: (err: any) => void) => errCb(new Error('Read fail')),
    };
    expect(await traverseFileSystemEntry(failingFileEntry)).toEqual([]);

    const failingDirEntry = {
      isFile: false,
      isDirectory: true,
      name: 'broken-dir',
      createReader: () => {
        throw new Error('Directory access denied');
      },
    };
    expect(await traverseFileSystemEntry(failingDirEntry)).toEqual([]);
  });
});
