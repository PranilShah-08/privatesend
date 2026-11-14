import { describe, it, expect, vi } from 'vitest';
import { PeerJSService } from '../src/services/peerjsService.js';

describe('PeerJSService Backpressure & Buffer Drain', () => {
  it('returns 0 bufferedAmount when no connections exist', () => {
    const service = new PeerJSService({});
    expect(service.getBufferedAmount()).toBe(0);
    service.destroy();
  });

  it('resolves immediately when bufferedAmount is below threshold', async () => {
    const service = new PeerJSService({});
    const mockDc = {
      bufferedAmount: 100 * 1024, // 100 KB
      bufferedAmountLowThreshold: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const mockConn = {
      peer: 'peer-1',
      open: true,
      dataChannel: mockDc,
    };

    (service as any).connections.set('peer-1', mockConn);

    expect(service.getBufferedAmount()).toBe(100 * 1024);
    await expect(service.waitForBufferDrain(1024 * 1024)).resolves.toBeUndefined();
    expect(mockDc.addEventListener).not.toHaveBeenCalled();

    service.destroy();
  });

  it('waits for bufferedamountlow event when bufferedAmount exceeds threshold', async () => {
    const service = new PeerJSService({});
    let lowCallback: any = null;

    const mockDc = {
      bufferedAmount: 2 * 1024 * 1024, // 2 MB
      bufferedAmountLowThreshold: 0,
      addEventListener: vi.fn().mockImplementation((event: string, cb: any) => {
        if (event === 'bufferedamountlow') {
          lowCallback = cb;
        }
      }),
      removeEventListener: vi.fn(),
    };
    const mockConn = {
      peer: 'peer-2',
      open: true,
      dataChannel: mockDc,
    };

    (service as any).connections.set('peer-2', mockConn);

    const waitPromise = service.waitForBufferDrain(1024 * 1024);

    expect(mockDc.bufferedAmountLowThreshold).toBe(512 * 1024);
    expect(mockDc.addEventListener).toHaveBeenCalledWith('bufferedamountlow', expect.any(Function));

    // Simulate event firing as buffer drains
    lowCallback();

    await waitPromise;
    expect(mockDc.removeEventListener).toHaveBeenCalledWith('bufferedamountlow', expect.any(Function));

    service.destroy();
  });
});
