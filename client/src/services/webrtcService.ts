import { DEFAULT_CHUNK_SIZE, packChunkHeader, unpackChunkHeader } from './chunkerService.js';
import type { FileManifest, IntegrityReport } from '../../../shared/types.js';

export interface WebRTCServiceEvents {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannelOpen?: () => void;
  onDataChannelClose?: () => void;
  onManifestReceived?: (manifest: FileManifest) => void;
  onChunkReceived?: (chunkIndex: number, payload: ArrayBuffer) => void;
  onTransferComplete?: () => void;
  onIntegrityReport?: (report: IntegrityReport) => void;
  onError?: (err: Error) => void;
}

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private events: WebRTCServiceEvents;
  private readonly config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  };

  constructor(events: WebRTCServiceEvents = {}) {
    this.events = events;
  }

  public initPeerConnection(
    onIceCandidate: (candidate: RTCIceCandidate) => void
  ): RTCPeerConnection {
    if (this.pc) {
      this.close();
    }

    this.pc = new RTCPeerConnection(this.config);

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.events.onConnectionStateChange?.(this.pc.connectionState);
      }
    };

    // When acting as receiver, data channel comes in on the peer connection
    this.pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    return this.pc;
  }

  public createDataChannel(label = 'fileTransfer'): RTCDataChannel {
    if (!this.pc) {
      throw new Error('PeerConnection not initialized');
    }
    const channel = this.pc.createDataChannel(label, {
      ordered: true, // Lossless guarantee
    });
    this.setupDataChannel(channel);
    return channel;
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dc = channel;
    this.dc.binaryType = 'arraybuffer';
    this.dc.bufferedAmountLowThreshold = 64 * 1024; // 64 KB low watermark

    this.dc.onopen = () => {
      this.events.onDataChannelOpen?.();
    };

    this.dc.onclose = () => {
      this.events.onDataChannelClose?.();
    };

    this.dc.onerror = (err) => {
      this.events.onError?.(new Error(`DataChannel error: ${err}`));
    };

    this.dc.onmessage = (event) => {
      this.handleIncomingMessage(event.data);
    };
  }

  private handleIncomingMessage(data: string | ArrayBuffer) {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'MANIFEST') {
          this.events.onManifestReceived?.(parsed as FileManifest);
        } else if (parsed.type === 'TRANSFER_COMPLETE') {
          this.events.onTransferComplete?.();
        } else if (parsed.type === 'INTEGRITY_REPORT') {
          this.events.onIntegrityReport?.(parsed.report as IntegrityReport);
        }
      } catch (e) {
        console.error('Failed to parse text message', e);
      }
      return;
    }

    if (data instanceof ArrayBuffer) {
      const { chunkIndex, payload } = unpackChunkHeader(data);
      this.events.onChunkReceived?.(chunkIndex, payload);
    }
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  public async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('ICE candidate addition ignored or failed', e);
    }
  }

  public sendManifest(manifest: FileManifest): void {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }
    this.dc.send(JSON.stringify(manifest));
  }

  public sendIntegrityReport(report: IntegrityReport): void {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify({ type: 'INTEGRITY_REPORT', report }));
  }

  public sendTransferComplete(): void {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify({ type: 'TRANSFER_COMPLETE' }));
  }

  /**
   * High performance streaming chunk sender with backpressure control.
   * Prevents buffer bloat and browser memory crash on large multi-GB files.
   */
  public async sendFileStream(
    file: File | Blob,
    onProgress: (bytesSent: number) => void,
    chunkSize = DEFAULT_CHUNK_SIZE
  ): Promise<void> {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('DataChannel not ready for transfer');
    }

    const totalBytes = file.size;
    let offset = 0;
    let chunkIndex = 0;
    const maxBuffer = 512 * 1024; // 512 KB backpressure ceiling

    while (offset < totalBytes) {
      // Flow control backpressure: if internal buffer is full, wait for it to drain safely
      if (this.dc.bufferedAmount > maxBuffer) {
        await new Promise<void>((resolve, reject) => {
          if (!this.dc || this.dc.readyState !== 'open') {
            return reject(new Error('DataChannel closed during backpressure wait'));
          }

          const channel = this.dc;
          const cleanup = () => {
            channel.onbufferedamountlow = null;
            channel.removeEventListener('close', onClose);
            channel.removeEventListener('error', onError);
          };

          const onLow = () => {
            cleanup();
            resolve();
          };

          const onClose = () => {
            cleanup();
            reject(new Error('DataChannel closed while transferring'));
          };

          const onError = (e: Event) => {
            cleanup();
            reject(new Error(`DataChannel error while transferring: ${e}`));
          };

          channel.onbufferedamountlow = onLow;
          channel.addEventListener('close', onClose, { once: true });
          channel.addEventListener('error', onError, { once: true });
        });
      }

      const slice = file.slice(offset, offset + chunkSize);
      const buffer = await slice.arrayBuffer();
      const packed = packChunkHeader(chunkIndex, buffer);

      this.dc.send(packed);

      offset += buffer.byteLength;
      chunkIndex++;
      onProgress(offset);
    }

    this.sendTransferComplete();
  }

  public isChannelOpen(): boolean {
    return this.dc?.readyState === 'open';
  }

  public close(): void {
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
