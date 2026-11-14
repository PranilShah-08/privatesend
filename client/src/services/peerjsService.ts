import { Peer, DataConnection } from 'peerjs';
import {
  packChunkHeader,
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

export interface PeerJSServiceCallbacks {
  onReady?: (code: string) => void;
  onPeerConnected?: () => void;
  onPeerDisconnected?: () => void;
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
  private callbacks: PeerJSServiceCallbacks;
  private isBatchActive = false;

  constructor(callbacks: PeerJSServiceCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initializes Receiver mode: claims the 6-digit room code on PeerJS cloud
   */
  public initReceiver(roomCode: string): Promise<string> {
    this.destroy();
    const peerId = this.formatPeerId(roomCode);

    return new Promise((resolve, reject) => {
      try {
        const peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
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
            // Already connected to a sender; reject 3rd party
            incomingConn.close();
            return;
          }

          this.setupConnection(incomingConn);
        });

        peer.on('error', (err: any) => {
          // If code collision occurs, inform caller to regenerate
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
   * Initializes Sender mode: connects to the receiver's 6-digit room code
   */
  public connectToReceiver(roomCode: string): Promise<void> {
    this.destroy();
    const targetPeerId = this.formatPeerId(roomCode);

    return new Promise((resolve, reject) => {
      try {
        // Ephemeral sender peer ID
        const peer = new Peer({
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });

        this.peer = peer;

        peer.on('open', () => {
          this.callbacks.onStatusChange?.('Connecting to receiver...');
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
            const friendlyErr = new Error('Receiver not found. Check the room code.');
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

    conn.on('open', () => {
      this.callbacks.onPeerConnected?.();
      this.callbacks.onStatusChange?.('Direct P2P Encrypted Channel Ready');
    });

    conn.on('data', (raw: any) => {
      this.handleIncomingData(raw);
    });

    conn.on('close', () => {
      this.callbacks.onPeerDisconnected?.();
      this.callbacks.onStatusChange?.('Peer disconnected');
      this.conn = null;
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
    } else if (data instanceof ArrayBuffer) {
      try {
        if (this.isBatchActive) {
          const { fileIndex, chunkIndex, payload } = unpackBatchChunkHeader(data);
          this.callbacks.onChunkReceived?.(chunkIndex, payload, fileIndex);
        } else {
          const { chunkIndex, payload } = unpackChunkHeader(data);
          this.callbacks.onChunkReceived?.(chunkIndex, payload, 0);
        }
      } catch (e) {
        console.error('Failed to unpack chunk', e);
      }
    }
  }

  public sendChunk(data: ArrayBuffer): void {
    if (!this.conn || !this.conn.open) {
      throw new Error('P2P connection not open for sending chunk');
    }
    this.conn.send(data);
  }

  public sendBatchChunk(fileIndex: number, chunkIndex: number, payload: ArrayBuffer): void {
    const packed = packBatchChunkHeader(fileIndex, chunkIndex, payload);
    this.sendChunk(packed);
  }

  public sendItemAck(fileIndex: number): void {
    if (!this.conn || !this.conn.open) return;
    this.conn.send(JSON.stringify({ type: 'ITEM_ACK', fileIndex }));
  }

  public sendManifest(manifest: FileManifest): void {
    if (!this.conn || !this.conn.open) {
      throw new Error('P2P connection not open');
    }
    this.conn.send(JSON.stringify(manifest));
  }

  public sendBatchManifest(manifest: BatchManifest): void {
    if (!this.conn || !this.conn.open) {
      throw new Error('P2P connection not open');
    }
    this.isBatchActive = true;
    this.conn.send(JSON.stringify(manifest));
  }

  public sendIntegrityReport(report: IntegrityReport): void {
    if (!this.conn || !this.conn.open) return;
    this.conn.send(JSON.stringify({ type: 'INTEGRITY_REPORT', ...report }));
  }

  public sendBatchIntegrityReport(report: BatchIntegrityReport): void {
    if (!this.conn || !this.conn.open) return;
    this.conn.send(JSON.stringify({ type: 'BATCH_INTEGRITY_REPORT', ...report }));
  }

  public sendItemComplete(fileIndex: number): void {
    if (!this.conn || !this.conn.open) return;
    this.conn.send(JSON.stringify({ type: 'ITEM_COMPLETE', fileIndex }));
  }

  public sendTransferComplete(): void {
    if (!this.conn || !this.conn.open) return;
    this.conn.send(JSON.stringify({ type: 'TRANSFER_COMPLETE' }));
  }

  public async sendFileStream(
    file: File | Blob,
    onProgress: (bytesSent: number) => void,
    chunkSize = 64 * 1024
  ): Promise<void> {
    if (!this.conn || !this.conn.open) {
      throw new Error('P2P channel not open for file transfer');
    }

    const totalBytes = file.size;
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalBytes) {
      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      const packed = packChunkHeader(chunkIndex, buffer);

      this.conn.send(packed);

      offset += buffer.byteLength;
      chunkIndex++;
      onProgress(offset);

      // Throttling loop every 16 chunks to allow browser event loop and RTC buffer drain
      if (chunkIndex % 16 === 0) {
        await new Promise((r) => setTimeout(r, 4));
      }
    }

    this.sendTransferComplete();
  }

  public isConnected(): boolean {
    return this.conn !== null && this.conn.open;
  }

  public destroy(): void {
    this.isBatchActive = false;
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
