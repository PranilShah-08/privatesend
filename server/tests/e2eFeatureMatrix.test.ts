import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { setupSignalingHandler } from '../src/signalingHandler.js';
import { RoomManager } from '../src/roomManager.js';
import { SlidingRateLimiter } from '../src/rateLimiter.js';
import { createInMemoryZip } from '../../client/src/services/zipBundleService.js';
import {
  deriveKeyFromRoomCode,
  encryptPayload,
  decryptPayload,
  generateSalt,
  getChunkIv,
} from '../../client/src/services/encryptionService.js';
import { zeroizeMapBuffers } from '../../client/src/services/panicWipeService.js';
import * as fflate from 'fflate';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types.js';

describe('PrivateSend Full Feature Matrix Integration Tests', () => {
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
    rateLimiter = new SlidingRateLimiter({ maxAttempts: 5, windowMs: 15000, blockDurationMs: 60000 });

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

  // Feature 1: Direct 1-to-1 Room Code Lifecycle & Strict Zero-Persistence Exclusivity
  it('Feature 1: executes complete 1:1 room code pairing, relaying, and ephemeral cleanup', async () => {
    const receiver = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const sender = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const thirdParty = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    // 1. Receiver creates room
    const createData = await new Promise<{ code: string }>((resolve) => {
      receiver.on('room:created', (data) => resolve(data));
      receiver.emit('room:create');
    });

    expect(createData.code).toMatch(/^\d{3}-\d{3}$/);

    // 2. Sender joins with room code
    const senderJoinPromise = new Promise<{ code: string; role: string; mode?: string }>((resolve) => {
      sender.on('room:joined', (data) => resolve(data as any));
    });
    const receiverJoinedPromise = new Promise<void>((resolve) => {
      receiver.on('peer:connected', () => resolve());
    });

    sender.emit('room:join', { code: createData.code });
    const joinResult = await senderJoinPromise;
    await receiverJoinedPromise;

    expect(joinResult.code).toBe(createData.code);
    expect(joinResult.role).toBe('sender');

    // 3. Strict 2-party exclusivity: 3rd party is blocked
    const lockError = await new Promise<{ code: string }>((resolve) => {
      thirdParty.on('error', (err) => resolve(err));
      thirdParty.emit('room:join', { code: createData.code });
    });
    expect(lockError.code).toBe('ROOM_LOCKED');

    // 4. Signaling relay test
    const offerPromise = new Promise<{ sdp: any }>((resolve) => {
      receiver.on('webrtc:offer', (data) => resolve(data));
    });
    sender.emit('webrtc:offer', { code: createData.code, sdp: { type: 'offer', sdp: 'v=0' } });
    const receivedOffer = await offerPromise;
    expect(receivedOffer.sdp.type).toBe('offer');

    // 5. Ephemeral cleanup on disconnect (zero persistence)
    const disconnectPromise = new Promise<{ reason: string }>((resolve) => {
      receiver.on('peer:disconnected', (data) => resolve(data));
    });
    sender.disconnect();
    const disconnectNotice = await disconnectPromise;
    expect(disconnectNotice.reason).toContain('disconnected');

    // Ensure room is completely purged from server memory
    expect(roomManager.getRoom(createData.code)).toBeUndefined();

    receiver.disconnect();
    thirdParty.disconnect();
  });

  // Feature 2: Local Wi-Fi Subnet Peer Discovery & Consent Handshake
  it('Feature 2: handles local Wi-Fi presence discovery and explicit transfer consent/decline', async () => {
    const peerA = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const peerB = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    // Peer A announces presence as receiver
    peerA.emit('local:announce', {
      deviceName: 'Office iMac',
      peerId: 'peer-imac-456',
    });

    // Peer B receives updated peer roster
    const peerList = await new Promise<any[]>((resolve) => {
      peerB.on('local:peers-updated', (peers) => {
        if (peers.some((p) => p.peerId === 'peer-imac-456')) {
          resolve(peers);
        }
      });
    });

    const announcedPeer = peerList.find((p) => p.peerId === 'peer-imac-456');
    expect(announcedPeer).toBeDefined();
    expect(announcedPeer.deviceName).toBe('Office iMac');

    // Peer B sends a transfer consent request to Peer A
    const reqPromise = new Promise<any>((resolve) => {
      peerA.on('local:incoming-request', (req) => resolve(req));
    });

    const clientReqId = 'req-test-1234';
    peerB.emit('local:request-transfer', {
      requestId: clientReqId,
      targetSocketId: announcedPeer.socketId,
      senderDeviceName: 'MacBook Air',
      senderPeerId: 'peer-air-789',
      fileCount: 3,
      totalBytes: 5242880,
      firstFileName: 'project_archive.tar.gz',
      isFolder: false,
    });

    const incomingReq = await reqPromise;
    expect(incomingReq.requestId).toBe(clientReqId);
    expect(incomingReq.senderDeviceName).toBe('MacBook Air');
    expect(incomingReq.fileCount).toBe(3);
    expect(incomingReq.totalBytes).toBe(5242880);

    // Peer A accepts the request
    const acceptPromise = new Promise<any>((resolve) => {
      peerB.on('local:request-accepted', (res) => resolve(res));
    });

    peerA.emit('local:respond-transfer', {
      requestId: incomingReq.requestId,
      senderSocketId: incomingReq.senderSocketId,
      accepted: true,
      receiverPeerId: 'peer-imac-456',
    });

    const acceptResponse = await acceptPromise;
    expect(acceptResponse.requestId).toBe(clientReqId);
    expect(acceptResponse.receiverPeerId).toBe('peer-imac-456');

    // Test decline branch
    const declineReqPromise = new Promise<any>((resolve) => {
      peerA.on('local:incoming-request', (req) => resolve(req));
    });
    peerB.emit('local:request-transfer', {
      requestId: 'req-decline-567',
      targetSocketId: announcedPeer.socketId,
      senderDeviceName: 'MacBook Air',
      senderPeerId: 'peer-air-789',
      fileCount: 1,
      totalBytes: 100,
      firstFileName: 'notes.txt',
    });
    const declineReq = await declineReqPromise;

    const declinePromise = new Promise<any>((resolve) => {
      peerB.on('local:request-declined', (res) => resolve(res));
    });
    peerA.emit('local:respond-transfer', {
      requestId: declineReq.requestId,
      senderSocketId: declineReq.senderSocketId,
      accepted: false,
      reason: 'User busy with another task',
    });

    const declineResponse = await declinePromise;
    expect(declineResponse.reason).toBe('User busy with another task');

    peerA.disconnect();
    peerB.disconnect();
  });

  // Feature 3: 1-to-Many Broadcast Session
  it('Feature 3: manages 1-to-Many broadcast room lifecycle with multiple receivers concurrently', async () => {
    const host = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const receiver1 = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;
    const receiver2 = ioc(`http://localhost:${port}`) as ClientSocket<ServerToClientEvents, ClientToServerEvents>;

    // 1. Host creates broadcast room
    const hostData = await new Promise<{ code: string }>((resolve) => {
      host.on('room:created', (data) => resolve(data));
      host.emit('broadcast:create');
    });

    expect(hostData.code).toMatch(/^\d{3}-\d{3}$/);

    // 2. Both receivers join simultaneously
    const r1Join = new Promise<{ code: string; role: string }>((resolve) => {
      receiver1.on('room:joined', (d) => resolve(d));
    });
    const r2Join = new Promise<{ code: string; role: string }>((resolve) => {
      receiver2.on('room:joined', (d) => resolve(d));
    });

    const hostReceiverJoinedEvents: any[] = [];
    host.on('broadcast:receiver-joined', (data) => {
      hostReceiverJoinedEvents.push(data);
    });

    receiver1.emit('broadcast:join', { code: hostData.code });
    receiver2.emit('broadcast:join', { code: hostData.code });

    await Promise.all([r1Join, r2Join]);
    await new Promise((r) => setTimeout(r, 60));

    expect(hostReceiverJoinedEvents.length).toBe(2);
    expect(hostReceiverJoinedEvents[1].receiverCount).toBe(2);

    // 3. Receiver 1 leaves -> host notified
    const leftPromise = new Promise<any>((resolve) => {
      host.on('broadcast:receiver-left', (d) => resolve(d));
    });
    receiver1.disconnect();
    const leftData = await leftPromise;
    expect(leftData.receiverCount).toBe(1);

    // 4. Host disconnects -> Receiver 2 receives room closed
    const closedPromise = new Promise<any>((resolve) => {
      receiver2.on('peer:disconnected', (d) => resolve(d));
    });
    host.disconnect();
    const closedNotice = await closedPromise;
    expect(closedNotice.reason).toContain('Broadcast host terminated');

    receiver2.disconnect();
  });

  // Feature 4: Recursive Folder Traversal & In-Memory ZIP Generation
  it('Feature 4: builds and verifies in-memory ZIP package without disk persistence', async () => {
    const file1Data = new TextEncoder().encode('Hello world from file 1');
    const file2Data = new TextEncoder().encode('Nested subfolder content in file 2');

    const zipInput = [
      {
        relativePath: 'test-folder/readme.txt',
        buffer: file1Data.buffer,
      },
      {
        relativePath: 'test-folder/sub/nested.txt',
        buffer: file2Data.buffer,
      },
    ];

    // Generate in-memory ZIP
    const zipBlob = createInMemoryZip(zipInput);
    expect(zipBlob.size).toBeGreaterThan(0);

    const arrayBuffer = await zipBlob.arrayBuffer();
    const zipBytes = new Uint8Array(arrayBuffer);

    // Decompress and verify lossless preservation of file contents and paths
    const unzipped = fflate.unzipSync(zipBytes);
    expect(unzipped['test-folder/readme.txt']).toBeDefined();
    expect(unzipped['test-folder/sub/nested.txt']).toBeDefined();

    const recovered1 = new TextDecoder().decode(unzipped['test-folder/readme.txt']);
    const recovered2 = new TextDecoder().decode(unzipped['test-folder/sub/nested.txt']);

    expect(recovered1).toBe('Hello world from file 1');
    expect(recovered2).toBe('Nested subfolder content in file 2');
  });

  // Feature 5: Lossless AES-GCM Authenticated Encryption & Integrity
  it('Feature 5: performs end-to-end AES-GCM authenticated encryption and decryption', async () => {
    const roomCode = '987-654';
    const salt = generateSalt();
    const key = await deriveKeyFromRoomCode(roomCode, salt);

    const originalData = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    const iv = getChunkIv(0, 0, 123456);

    const encrypted = await encryptPayload(originalData.buffer as ArrayBuffer, key, iv);
    expect(encrypted.byteLength).toBeGreaterThan(originalData.byteLength);

    const decrypted = await decryptPayload(encrypted, key, iv);
    expect(new Uint8Array(decrypted)).toEqual(originalData);
  });

  // Feature 6: Panic Wipe & Memory Zeroization
  it('Feature 6: zeroizes memory buffers completely on panic wipe', () => {
    const chunkMap = new Map<number, ArrayBuffer>();
    const buf1 = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const buf2 = new Uint8Array([9, 8, 7, 6]).buffer;
    chunkMap.set(0, buf1);
    chunkMap.set(1, buf2);

    zeroizeMapBuffers(chunkMap);

    // Verify all bytes are 0
    expect(Array.from(new Uint8Array(buf1))).toEqual([0, 0, 0, 0, 0]);
    expect(Array.from(new Uint8Array(buf2))).toEqual([0, 0, 0, 0]);
  });
});
