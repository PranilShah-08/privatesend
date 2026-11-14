import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { setupSignalingHandler } from '../src/signalingHandler.js';
import { RoomManager } from '../src/roomManager.js';
import { SlidingRateLimiter } from '../src/rateLimiter.js';
import type { ServerToClientEvents, ClientToServerEvents, FileManifest, IntegrityReport } from '../../shared/types.js';

describe('Signaling Server Integration', () => {
  let io: Server<ClientToServerEvents, ServerToClientEvents>;
  let server: ReturnType<typeof createServer>;
  let port: number;
  let roomManager: RoomManager;
  let rateLimiter: SlidingRateLimiter;

  beforeAll(async () => {
    const app = express();
    server = createServer(app);
    io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
      cors: { origin: '*' },
    });

    roomManager = new RoomManager();
    rateLimiter = new SlidingRateLimiter({ maxAttempts: 5 });

    setupSignalingHandler(io, roomManager, rateLimiter);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      io.close(() => {
        server.close(() => resolve());
      });
    });
  });

  it('allows receiver to create room and sender to join', async () => {
    const clientReceiver = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const clientSender = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    const roomCode = await new Promise<string>((resolve) => {
      clientReceiver.on('room:created', (data) => {
        resolve(data.code);
      });
      clientReceiver.emit('room:create');
    });

    expect(roomCode).toMatch(/^\d{3}-\d{3}$/);

    const joinResult = await new Promise<{ code: string; role: string }>((resolve) => {
      clientSender.on('room:joined', (data) => {
        resolve(data);
      });
      clientSender.emit('room:join', { code: roomCode });
    });

    expect(joinResult.code).toBe(roomCode);
    expect(joinResult.role).toBe('sender');

    clientReceiver.disconnect();
    clientSender.disconnect();
  });

  it('strictly blocks a third party from joining an already locked room', async () => {
    const receiver = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const sender = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const attacker = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    const roomCode = await new Promise<string>((resolve) => {
      receiver.on('room:created', (data) => resolve(data.code));
      receiver.emit('room:create');
    });

    await new Promise<void>((resolve) => {
      sender.on('room:joined', () => resolve());
      sender.emit('room:join', { code: roomCode });
    });

    const errorResult = await new Promise<{ message: string; code: string }>((resolve) => {
      attacker.on('error', (err) => resolve(err));
      attacker.emit('room:join', { code: roomCode });
    });

    expect(errorResult.code).toBe('ROOM_LOCKED');

    receiver.disconnect();
    sender.disconnect();
    attacker.disconnect();
  });

  it('exchanges WebRTC SDP offer, answer, and ICE candidates between peers', async () => {
    const receiver = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const sender = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    const roomCode = await new Promise<string>((resolve) => {
      receiver.on('room:created', (data) => resolve(data.code));
      receiver.emit('room:create');
    });

    await new Promise<void>((resolve) => {
      sender.on('room:joined', () => resolve());
      sender.emit('room:join', { code: roomCode });
    });

    // Sender sends offer to receiver
    const mockOffer = { type: 'offer', sdp: 'mock-offer-sdp' };
    const receivedOfferPromise = new Promise<{ sdp: any }>((resolve) => {
      receiver.on('webrtc:offer', (data) => resolve(data));
    });

    sender.emit('webrtc:offer', { code: roomCode, sdp: mockOffer });
    const receivedOffer = await receivedOfferPromise;
    expect(receivedOffer.sdp).toEqual(mockOffer);

    // Receiver sends answer back to sender
    const mockAnswer = { type: 'answer', sdp: 'mock-answer-sdp' };
    const receivedAnswerPromise = new Promise<{ sdp: any }>((resolve) => {
      sender.on('webrtc:answer', (data) => resolve(data));
    });

    receiver.emit('webrtc:answer', { code: roomCode, sdp: mockAnswer });
    const receivedAnswer = await receivedAnswerPromise;
    expect(receivedAnswer.sdp).toEqual(mockAnswer);

    // ICE Candidate
    const mockCandidate = { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host', sdpMid: '0' };
    const receivedIcePromise = new Promise<{ candidate: any }>((resolve) => {
      receiver.on('webrtc:ice-candidate', (data) => resolve(data));
    });

    sender.emit('webrtc:ice-candidate', { code: roomCode, candidate: mockCandidate });
    const receivedIce = await receivedIcePromise;
    expect(receivedIce.candidate).toEqual(mockCandidate);

    receiver.disconnect();
    sender.disconnect();
  });

  it('forwards fallback relay manifest, chunks, complete, and integrity report', async () => {
    const receiver = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const sender = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    const roomCode = await new Promise<string>((resolve) => {
      receiver.on('room:created', (data) => resolve(data.code));
      receiver.emit('room:create');
    });

    await new Promise<void>((resolve) => {
      sender.on('room:joined', () => resolve());
      sender.emit('room:join', { code: roomCode });
    });

    // Test Relay Manifest
    const mockManifest: FileManifest = {
      type: 'MANIFEST',
      fileId: 'file-123',
      fileName: 'photo.raw',
      fileSize: 1024,
      fileType: 'image/x-raw',
      chunkSize: 65536,
      totalChunks: 1,
      sha256: 'abc123hash',
    };

    const manifestPromise = new Promise<FileManifest>((resolve) => {
      receiver.on('relay:manifest', (data) => resolve(data));
    });
    sender.emit('relay:manifest', { code: roomCode, manifest: mockManifest });
    const receivedManifest = await manifestPromise;
    expect(receivedManifest.fileName).toBe('photo.raw');

    // Test Relay Chunk
    const testChunk = new Uint8Array([1, 2, 3, 4]).buffer;
    const chunkPromise = new Promise<{ chunkIndex: number; data: any }>((resolve) => {
      receiver.on('relay:chunk', (data) => resolve(data));
    });
    sender.emit('relay:chunk', { code: roomCode, chunkIndex: 0, totalChunks: 1, data: testChunk });
    const receivedChunk = await chunkPromise;
    expect(receivedChunk.chunkIndex).toBe(0);

    // Test Relay Complete
    const completePromise = new Promise<{ fileId: string }>((resolve) => {
      receiver.on('relay:complete', (data) => resolve(data));
    });
    sender.emit('relay:complete', { code: roomCode, fileId: 'file-123' });
    const receivedComplete = await completePromise;
    expect(receivedComplete.fileId).toBe('file-123');

    // Test Relay Integrity
    const mockReport: IntegrityReport = {
      fileId: 'file-123',
      fileName: 'photo.raw',
      fileSize: 1024,
      senderSha256: 'abc123hash',
      receiverSha256: 'abc123hash',
      isMatch: true,
      timestamp: Date.now(),
    };

    const integrityPromise = new Promise<IntegrityReport>((resolve) => {
      sender.on('relay:integrity', (data) => resolve(data));
    });
    receiver.emit('relay:integrity', { code: roomCode, report: mockReport });
    const receivedIntegrity = await integrityPromise;
    expect(receivedIntegrity.isMatch).toBe(true);

    receiver.disconnect();
    sender.disconnect();
  });

  it('safely handles messages to invalid rooms and clean room:leave', async () => {
    const client = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    // Send WebRTC signals to non-existent room - should not throw
    client.emit('webrtc:offer', { code: '000-000', sdp: {} });
    client.emit('webrtc:answer', { code: '000-000', sdp: {} });
    client.emit('webrtc:ice-candidate', { code: '000-000', candidate: {} });
    client.emit('relay:manifest', { code: '000-000', manifest: {} as any });
    client.emit('relay:chunk', { code: '000-000', chunkIndex: 0, totalChunks: 1, data: new ArrayBuffer(0) });
    client.emit('relay:complete', { code: '000-000', fileId: 'none' });
    client.emit('relay:integrity', { code: '000-000', report: {} as any });

    // Explicit room:leave
    client.emit('room:leave');

    // Allow socket to process
    await new Promise((r) => setTimeout(r, 50));
    client.disconnect();
  });

  it('rejects invalid non-string room code and rate-limited attempts', async () => {
    const client = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
      client.on('error', (err) => resolve(err));
    });

    client.emit('room:join', { code: null as any });
    const err = await errorPromise;
    expect(err.code).toBe('INVALID_INPUT');

    // Trigger rate limiting on rateLimiter
    const rateLimitClient = ioc(`http://localhost:${port}`, {
      extraHeaders: {
        'x-forwarded-for': '1.2.3.4',
      },
    }) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    for (let i = 0; i < 6; i++) {
      rateLimiter.recordFailure('1.2.3.4');
    }

    const rateLimitErrorPromise = new Promise<{ code: string; message: string }>((resolve) => {
      rateLimitClient.on('error', (err) => resolve(err));
    });

    rateLimitClient.emit('room:join', { code: '111-222' });
    const rateLimitErr = await rateLimitErrorPromise;
    expect(rateLimitErr.code).toBe('RATE_LIMITED');

    client.disconnect();
    rateLimitClient.disconnect();
  });
});
