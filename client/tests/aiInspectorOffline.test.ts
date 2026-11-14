import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  inspectDocumentClientSide,
  inspectDocumentEphemeral,
} from '../src/services/aiInspectorService.js';

describe('AIInspectorService Offline Heuristics', () => {
  const sampleDocument = `
    PrivateSend is an end-to-end encrypted direct peer-to-peer file transfer application.
    It guarantees bit-for-bit lossless data integrity using SHA-256 cryptographic verification.
    No file data or encryption keys are ever retained on any server or intermediary disk.
    PrivateSend runs purely in volatile client RAM and terminates all memory state upon session wipe.
    Users can contact security@privatesend.local or visit https://privatesend.local for audit reports.
  `;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts key topics, summary, and sample entities in client-side RAM', () => {
    const result = inspectDocumentClientSide({
      fileName: 'architecture.txt',
      documentText: sampleDocument,
    });

    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(20);
    expect(result.keyTopics.length).toBeGreaterThan(0);
    expect(result.keyTopics.some((t) => t.toLowerCase().includes('privatesend') || t.toLowerCase().includes('encrypted'))).toBe(true);
    expect(result.audit.storageMode).toBe('volatile_client_ram');
    expect(result.audit.zeroDiskPersistence).toBe(true);
    expect(result.audit.ramFlushed).toBe(true);
  });

  it('answers queries using contextual snippet search in client RAM', () => {
    const result = inspectDocumentClientSide({
      fileName: 'architecture.txt',
      documentText: sampleDocument,
      query: 'What guarantees data integrity?',
    });

    expect(result.answer).toBeDefined();
    expect(result.answer).toContain('SHA-256');
  });

  it('handles empty document and queries gracefully', () => {
    const empty1 = inspectDocumentClientSide({
      fileName: 'empty.txt',
      documentText: '',
      query: 'test',
    });
    expect(empty1.summary).toBe('Empty document.');
    expect(empty1.answer).toBe('Document contains no readable text.');

    const empty2 = inspectDocumentClientSide({
      fileName: 'empty.txt',
      documentText: '   ',
    });
    expect(empty2.summary).toBe('Empty document.');
    expect(empty2.answer).toBeUndefined();
  });

  it('handles short document and stopword queries', () => {
    const shortDoc = inspectDocumentClientSide({
      fileName: 'short.txt',
      documentText: 'PrivateSend is fast and secure.',
      query: 'the and or', // only stop words
    });
    expect(shortDoc.summary).toBe('PrivateSend is fast and secure.');
    expect(shortDoc.answer).toBe('PrivateSend is fast and secure.');

    const noMatch = inspectDocumentClientSide({
      fileName: 'short.txt',
      documentText: 'PrivateSend is fast and secure.',
      query: 'quantum superposition biology', // no match
    });
    expect(noMatch.answer).toContain('No direct matching answer found');
  });

  it('falls back to client-side heuristics seamlessly when remote indexer fails', async () => {
    // Mock fetch to simulate network error or offline LlamaIndex backend
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await inspectDocumentEphemeral({
      fileName: 'architecture.txt',
      documentText: sampleDocument,
      query: 'Where are encryption keys retained?',
    });

    expect(result.summary).toBeDefined();
    expect(result.audit.storageMode).toBe('volatile_client_ram');
    expect(result.answer).toBeDefined();
    expect(result.answer).toContain('No file data or encryption keys are ever retained');
  });
});
