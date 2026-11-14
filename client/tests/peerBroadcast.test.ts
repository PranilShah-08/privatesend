import { describe, it, expect, vi } from 'vitest';
import { PeerJSService } from '../src/services/peerjsService.js';
import type { BatchManifest } from '../../shared/types.js';

describe('PeerJSService Multi-Receiver Broadcast', () => {
  it('instantiates and manages callbacks correctly', () => {
    const onStatusChange = vi.fn();
    const service = new PeerJSService({ onStatusChange });
    expect(service).toBeDefined();
    expect(service.isConnected()).toBe(false);
  });

  it('broadcasts chunks and manifests across multiple open connections', () => {
    const service = new PeerJSService({});
    const mockConn1 = {
      peer: 'peer-1',
      open: true,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    };
    const mockConn2 = {
      peer: 'peer-2',
      open: true,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    };

    // Inject mock connections via setupConnection
    (service as any).setupConnection(mockConn1);
    (service as any).setupConnection(mockConn2);

    expect(service.getConnectedPeerCount()).toBe(2);
    expect(service.isConnected()).toBe(true);

    const mockManifest: BatchManifest = {
      type: 'BATCH_MANIFEST',
      batchId: 'batch-1',
      totalFiles: 1,
      totalBatchBytes: 100,
      encrypted: false,
      files: [],
    };

    service.sendBatchManifest(mockManifest);
    expect(mockConn1.send).toHaveBeenCalledWith(JSON.stringify(mockManifest));
    expect(mockConn2.send).toHaveBeenCalledWith(JSON.stringify(mockManifest));

    // Send chunk
    const rawPayload = new Uint8Array([1, 2, 3]).buffer;
    service.sendBatchChunk(0, 0, rawPayload);
    expect(mockConn1.send).toHaveBeenCalledTimes(2);
    expect(mockConn2.send).toHaveBeenCalledTimes(2);

    // Close and destroy
    service.destroy();
    expect(mockConn1.close).toHaveBeenCalled();
    expect(mockConn2.close).toHaveBeenCalled();
    expect(service.getConnectedPeerCount()).toBe(0);
    expect(service.isConnected()).toBe(false);
  });
});
