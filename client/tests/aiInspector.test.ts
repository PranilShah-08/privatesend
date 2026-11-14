import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isFileInspectable,
  inspectDocumentEphemeral,
  getDefaultAiIndexerEndpoint,
} from '../src/services/aiInspectorService.js';

describe('AIInspectorService (v2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly identifies text and code files as inspectable', () => {
    expect(isFileInspectable('main.rs')).toBe(true);
    expect(isFileInspectable('script.py')).toBe(true);
    expect(isFileInspectable('index.html')).toBe(true);
    expect(isFileInspectable('README.md')).toBe(true);
    expect(isFileInspectable('data.json')).toBe(true);
    expect(isFileInspectable('notes.txt')).toBe(true);
    expect(isFileInspectable('log.log')).toBe(true);
    expect(isFileInspectable('custom.xyz', 'text/plain')).toBe(true);
    expect(isFileInspectable('custom.xyz', 'application/json')).toBe(true);
  });

  it('correctly identifies binary / non-text files as not inspectable', () => {
    expect(isFileInspectable('video.mp4', 'video/mp4')).toBe(false);
    expect(isFileInspectable('image.png', 'image/png')).toBe(false);
    expect(isFileInspectable('archive.zip', 'application/zip')).toBe(false);
    expect(isFileInspectable('firmware.bin', 'application/octet-stream')).toBe(false);
  });

  it('provides default AI indexer endpoint', () => {
    const endpoint = getDefaultAiIndexerEndpoint();
    expect(endpoint).toBe('http://localhost:8000/index-ephemeral');

    (global as any).window = {};
    const winEndpoint = getDefaultAiIndexerEndpoint();
    expect(winEndpoint).toBe('http://localhost:8000/index-ephemeral');
    delete (global as any).window;
  });

  it('successfully inspects document via mocked fetch', async () => {
    const mockResponse = {
      summary: 'Executive document summary',
      key_topics: ['security', 'privacy'],
      detected_language: 'en',
      answer: 'Relevant response',
      sample_entities: ['PrivateSend'],
      audit: {
        zero_disk_persistence: true,
        storage_mode: 'volatile_ram',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const result = await inspectDocumentEphemeral({
      fileName: 'doc.txt',
      documentText: 'Hello world sample text',
      query: 'What is this?',
    });

    expect(result.summary).toBe('Executive document summary');
    expect(result.keyTopics).toEqual(['security', 'privacy']);
    expect(result.audit.zeroDiskPersistence).toBe(true);
    expect(result.audit.storageMode).toBe('volatile_ram');
  });

  it('throws descriptive error on non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as any);

    await expect(
      inspectDocumentEphemeral({
        fileName: 'err.txt',
        documentText: 'broken',
      })
    ).rejects.toThrow('AI Inspector failed (500)');
  });
});
