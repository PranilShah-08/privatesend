import { Peer, DataConnection } from 'peerjs';
import {
  unpackChunkHeader,
  packBatchChunkHeader,
  unpackBatchChunkHeader,
} from './chunkerService.js';
import type {
  FileManifest,
  IntegrityReport,
  BatchManifest,
  BatchIntegrityReport,
} from '../../../shared/types.js';

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * Installs WebRTC ICE enhancements in browser environments:
 * Enhances addIceCandidate so that if an anonymized .local mDNS host candidate arrives,
 * a loopback (127.0.0.1) candidate is also attempted in parallel, allowing two tabs or
 * apps on the same device to connect immediately without mDNS discovery failures.
 */
export function setupWebRTCEnhancements(): void {
  if (typeof window === 'undefined' || !(window as any).RTCPeerConnection) return;
  const globalWin = window as any;
  if (globalWin.__webrtc_enhancements_installed) return;
  globalWin.__webrtc_enhancements_installed = true;

  const origProto = globalWin.RTCPeerConnection.prototype;
  const origAddIce = origProto.addIceCandidate;

  origProto.addIceCandidate = function (candidate: any, ...args: any[]) {
    if (candidate && candidate.candidate && candidate.candidate.includes('.local')) {
      const loopbackStr = candidate.candidate.replace(/[0-9a-f-]+\.local/, '127.0.0.1');
      const loopbackCand =
        typeof candidate.toJSON === 'function'
          ? { ...candidate.toJSON(), candidate: loopbackStr }
          : { ...candidate, candidate: loopbackStr };
      try {
        origAddIce.call(this, loopbackCand, ...args).catch(() => {});
      } catch {
        // Ignored
      }
    }
    return origAddIce.call(this, candidate, ...args);
  };
}

// Auto-install enhancements in browser context
if (typeof window !== 'undefined') {
  setupWebRTCEnhancements();
}

export interface PeerJSServiceCallbacks {
  onReady?: (code: string) => void;
  onPeerConnected?: (peerId?: string) => void;
  onPeerDisconnected?: (peerId?: string) => void;
  onManifestReceived?: (manifest: FileManifest) => void;
  onBatchManifestReceived?: (manifest: BatchManifest) => void;
  onChunkReceived?: (chunkIndex: number, payload: ArrayBuffer, fileIndex?: number) => void;
  onItemComplete?: (fileIndex: number) => void;
  onItemAck?: (fileIndex: number) => void;
  onTransferComplete?: () => void;
  onIntegrityReport?: (report: IntegrityReport) => void;
  onBatchIntegrityReport?: (report: BatchIntegrityReport) => void;
  onError?: (err: Error) => void;
  onStatusChange?: (status: string) => void;
}

export class PeerJSService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private connections = new Map<string, DataConnection>();
  private callbacks: PeerJSServiceCallbacks;
  private isBatchActive = false;
  private isBroadcast = false;

  constructor(callbacks: PeerJSServiceCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initializes Receiver mode: claims the 6-digit room code on PeerJS cloud (1-to-1)
   */
  public initReceiver(roomCode: string): Promise<string> {
    this.destroy();
    this.isBroadcast = false;
    const peerId = this.formatPeerId(roomCode);

    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: DEFAULT_ICE_SERVERS,
          },
        });

        this.peer = peer;

        peer.on('open', (id) => {
          this.callbacks.onStatusChange?.('Waiting for sender...');
          this.callbacks.onReady?.(roomCode);
          resolve(id);
        });

        // Enforce strict 1-to-1 exclusivity: accept first sender, reject subsequent peers
        peer.on('connection', (incomingConn) => {
          if (this.conn && this.conn.open) {
            incomingConn.close();
            return;
          }
          this.setupConnection(incomingConn);
        });

        peer.on('error', (err: any) => {
          if (err.type === 'unavailable-id') {
            reject(new Error('ROOM_CODE_TAKEN'));
          } else {
            this.callbacks.onError?.(err);
            reject(err);
          }
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  /**
   * Initializes Broadcast Host mode: claims room code and accepts multiple receivers concurrently (1-to-Many)
   */
  public initBroadcastHost(roomCode: string): Promise<string> {
    this.destroy();
    this.isBroadcast = true;
    const peerId = this.formatPeerId(roomCode);

    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: DEFAULT_ICE_SERVERS,
          },
        });

        this.peer = peer;

        peer.on('open', (id) => {
          this.callbacks.onStatusChange?.('Broadcast room ready. Waiting for receivers...');
          this.callbacks.onReady?.(roomCode);
          resolve(id);
        });

        // Accept all incoming receivers in broadcast session
        peer.on('connection', (incomingConn) => {
          this.setupConnection(incomingConn);
        });

        peer.on('error', (err: any) => {
          if (err.type === 'unavailable-id') {
            reject(new Error('ROOM_CODE_TAKEN'));
          } else {
            this.callbacks.onError?.(err);
            reject(err);
          }
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  /**
   * Initializes Sender or Receiver client: connects to target room code
   */
  public connectToReceiver(roomCode: string): Promise<void> {
    this.destroy();
    const targetPeerId = this.formatPeerId(roomCode);

    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer({
          debug: 1,
          config: {
            iceServers: DEFAULT_ICE_SERVERS,
          },
        });

        this.peer = peer;

        peer.on('open', () => {
          this.callbacks.onStatusChange?.('Connecting to peer...');
          const conn = peer.connect(targetPeerId, {
            reliable: true,
          });

          this.setupConnection(conn);

          conn.on('open', () => {
            resolve();
          });
        });

        peer.on('error', (err: any) => {
          if (err.type === 'peer-unavailable') {
            const friendlyErr = new Error('Peer not found. Check the room code.');
            this.callbacks.onError?.(friendlyErr);
            reject(friendlyErr);
          } else {
            this.callbacks.onError?.(err);
            reject(err);
          }
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  private setupConnection(conn: DataConnection) {
    this.conn = conn;
    this.connections.set(conn.peer, conn);

    conn.on('open', () => {
      this.callbacks.onPeerConnected?.(conn.peer);
      const count = this.connections.size;
      const status =
        this.isBroadcast && count > 1
          ? `Broadcasting to ${count} connected peers`
          : 'Direct P2P Encrypted Channel Ready';
      this.callbacks.onStatusChange?.(status);
    });

    conn.on('data', (raw: any) => {
      this.handleIncomingData(raw);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.callbacks.onPeerDisconnected?.(conn.peer);

      if (this.connections.size === 0) {
        this.conn = null;
        this.callbacks.onStatusChange?.('Peer disconnected');
      } else {
        this.callbacks.onStatusChange?.(`Broadcasting to ${this.connections.size} connected peers`);
      }
    });

    conn.on('error', (err) => {
      this.callbacks.onError?.(err);
    });
  }

  private handleIncomingData(data: any) {
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'MANIFEST') {
          this.callbacks.onManifestReceived?.(msg as FileManifest);
        } else if (msg.type === 'BATCH_MANIFEST') {
          this.isBatchActive = true;
          this.callbacks.onBatchManifestReceived?.(msg as BatchManifest);
        } else if (msg.type === 'ITEM_COMPLETE') {
          this.callbacks.onItemComplete?.(msg.fileIndex ?? 0);
        } else if (msg.type === 'ITEM_ACK') {
          this.callbacks.onItemAck?.(msg.fileIndex ?? 0);
        } else if (msg.type === 'TRANSFER_COMPLETE') {
          this.callbacks.onTransferComplete?.();
        } else if (msg.type === 'INTEGRITY_REPORT') {
          this.callbacks.onIntegrityReport?.(msg as IntegrityReport);
        } else if (msg.type === 'BATCH_INTEGRITY_REPORT') {
          this.callbacks.onBatchIntegrityReport?.(msg as BatchIntegrityReport);
        }
      } catch (e) {
        console.error('Failed to parse signaling message', e);
      }
    } else {
      let buffer: ArrayBuffer | null = null;
      if (data instanceof ArrayBuffer) {
        buffer = data;
      } else if (ArrayBuffer.isView(data)) {
        buffer = data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength
        ) as ArrayBuffer;
      }

      if (buffer) {
        try {
          if (this.isBatchActive) {
            const { fileIndex, chunkIndex, payload } = unpackBatchChunkHeader(buffer);
            this.callbacks.onChunkReceived?.(chunkIndex, payload, fileIndex);
          } else {
            const { chunkIndex, payload } = unpackChunkHeader(buffer);
            this.callbacks.onChunkReceived?.(chunkIndex, payload, 0);
          }
        } catch (e) {
          console.error('Failed to unpack chunk', e);
        }
      }
    }
  }

  public sendChunk(data: ArrayBuffer): void {
    if (this.connections.size === 0) {
      throw new Error('P2P connection not open for sending chunk');
    }
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(data);
      }
    }
  }

  public sendBatchChunk(fileIndex: number, chunkIndex: number, payload: ArrayBuffer): void {
    const packed = packBatchChunkHeader(fileIndex, chunkIndex, payload);
    this.sendChunk(packed);
  }

  public sendItemAck(fileIndex: number): void {
    const msg = JSON.stringify({ type: 'ITEM_ACK', fileIndex });
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  public sendManifest(manifest: FileManifest): void {
    if (this.connections.size === 0) {
      throw new Error('P2P connection not open');
    }
    const msg = JSON.stringify(manifest);
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  public sendBatchManifest(manifest: BatchManifest): void {
    if (this.connections.size === 0) {
      throw new Error('P2P connection not open');
    }
    this.isBatchActive = true;
    const msg = JSON.stringify(manifest);
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  public sendIntegrityReport(report: IntegrityReport): void {
    const msg = JSON.stringify({ type: 'INTEGRITY_REPORT', ...report });
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  public sendBatchIntegrityReport(report: BatchIntegrityReport): void {
    const msg = JSON.stringify({ type: 'BATCH_INTEGRITY_REPORT', ...report });
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  public sendItemComplete(fileIndex: number): void {
    const msg = JSON.stringify({ type: 'ITEM_COMPLETE', fileIndex });
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  public sendTransferComplete(): void {
    const msg = JSON.stringify({ type: 'TRANSFER_COMPLETE' });
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  public isConnected(): boolean {
    if (this.connections.size > 0) {
      for (const conn of this.connections.values()) {
        if (conn.open) return true;
      }
    }
    return this.conn !== null && this.conn.open;
  }

  public getConnectedPeerCount(): number {
    return this.connections.size;
  }

  public destroy(): void {
    this.isBatchActive = false;
    this.isBroadcast = false;

    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch (e) {
        // ignore
      }
    }
    this.connections.clear();

    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  private formatPeerId(roomCode: string): string {
    const digits = roomCode.replace(/\D/g, '');
    return `privatesend-room-${digits}`;
  }
}
