import { useState, useEffect, useRef, useCallback } from 'react';
import { io as ioc, Socket } from 'socket.io-client';
import { WebRTCService } from '../services/webrtcService.js';
import { computeFileSha256 } from '../services/cryptoService.js';
import { SpeedCalculator } from '../services/speedCalculator.js';
import { calculateTotalChunks, DEFAULT_CHUNK_SIZE } from '../services/chunkerService.js';
import type {
  ParticipantRole,
  FileManifest,
  TransferProgressStats,
  IntegrityReport,
  ConnectionMode,
  ServerToClientEvents,
  ClientToServerEvents,
} from '../../../shared/types.js';

export function useP2PTransfer() {
  const [mode, setModeState] = useState<ParticipantRole>('receiver');
  const [roomCode, setRoomCode] = useState<string>('');
  const [peerConnected, setPeerConnected] = useState<boolean>(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('p2p-webrtc');
  const [statusText, setStatusText] = useState<string>('Initializing...');
  const [errorText, setErrorText] = useState<string | null>(null);

  // File & Transfer States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [incomingManifest, setIncomingManifest] = useState<FileManifest | null>(null);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferStats, setTransferStats] = useState<TransferProgressStats | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Current values tracked in refs to eliminate stale closure traps in event listeners
  const modeRef = useRef<ParticipantRole>(mode);
  modeRef.current = mode;

  const roomCodeRef = useRef<string>(roomCode);
  roomCodeRef.current = roomCode;

  const incomingManifestRef = useRef<FileManifest | null>(incomingManifest);
  incomingManifestRef.current = incomingManifest;

  const downloadUrlRef = useRef<string | null>(downloadUrl);
  downloadUrlRef.current = downloadUrl;

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const webrtcRef = useRef<WebRTCService | null>(null);
  const speedCalcRef = useRef<SpeedCalculator>(new SpeedCalculator());
  const receivedChunksRef = useRef<Map<number, ArrayBuffer>>(new Map());
  const totalReceivedBytesRef = useRef<number>(0);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupDownloadUrl = useCallback(() => {
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
      setDownloadUrl(null);
    }
  }, []);

  const resetTransferState = useCallback(() => {
    receivedChunksRef.current.clear();
    totalReceivedBytesRef.current = 0;
    cleanupDownloadUrl();
    setIncomingManifest(null);
    incomingManifestRef.current = null;
    setIntegrityReport(null);
    setIsTransferring(false);
    setTransferStats(null);
  }, [cleanupDownloadUrl]);

  const switchToFallbackRelay = useCallback(() => {
    setConnectionMode('fallback-relay');
    setStatusText('Connected via Encrypted Relay (Lossless Active)');
  }, []);

  const handleIncomingManifest = useCallback((manifest: FileManifest) => {
    cleanupDownloadUrl();
    setIncomingManifest(manifest);
    incomingManifestRef.current = manifest;
    receivedChunksRef.current.clear();
    totalReceivedBytesRef.current = 0;
    setIsTransferring(true);
    setIntegrityReport(null);
    setErrorText(null);
    speedCalcRef.current.start(manifest.fileSize);
  }, [cleanupDownloadUrl]);

  const handleIncomingChunk = useCallback((chunkIndex: number, payload: ArrayBuffer) => {
    receivedChunksRef.current.set(chunkIndex, payload);
    totalReceivedBytesRef.current += payload.byteLength;

    const stats = speedCalcRef.current.update(totalReceivedBytesRef.current);
    setTransferStats(stats);
  }, []);

  const finishReceivedFile = useCallback(async () => {
    const manifest = incomingManifestRef.current;
    if (!manifest) return;

    // Verify all chunks are accounted for before assembly
    const chunks: ArrayBuffer[] = [];
    let missingChunk = false;
    for (let i = 0; i < manifest.totalChunks; i++) {
      const chunk = receivedChunksRef.current.get(i);
      if (!chunk) {
        missingChunk = true;
        break;
      }
      chunks.push(chunk);
    }

    if (missingChunk) {
      setErrorText(`Transfer failed: Expected ${manifest.totalChunks} chunks but received ${chunks.length}.`);
      setIsTransferring(false);
      return;
    }

    const assembledBlob = new Blob(chunks, { type: manifest.fileType });
    receivedChunksRef.current.clear();
    chunks.length = 0;
    const receiverSha256 = await computeFileSha256(assembledBlob);
    const isMatch = receiverSha256.toLowerCase() === manifest.sha256.toLowerCase();

    const report: IntegrityReport = {
      fileId: manifest.fileId,
      fileName: manifest.fileName,
      fileSize: manifest.fileSize,
      senderSha256: manifest.sha256,
      receiverSha256,
      isMatch,
      timestamp: Date.now(),
    };

    setIntegrityReport(report);
    setIsTransferring(false);

    if (isMatch) {
      cleanupDownloadUrl();
      const url = URL.createObjectURL(assembledBlob);
      downloadUrlRef.current = url;
      setDownloadUrl(url);
    } else {
      setErrorText('Cryptographic mismatch: Received file SHA-256 differs from sender!');
    }

    // Send verification report back to sender
    const currentCode = roomCodeRef.current;
    if (webrtcRef.current?.isChannelOpen()) {
      webrtcRef.current.sendIntegrityReport(report);
    } else {
      socketRef.current?.emit('relay:integrity', { code: currentCode, report });
    }
  }, [cleanupDownloadUrl]);

  // WebRTC Setup using mutable refs for dynamic state
  const setupWebRTCConnection = useCallback(() => {
    if (!socketRef.current) return;

    const webrtc = new WebRTCService({
      onConnectionStateChange: (state) => {
        if (state === 'connected') {
          setConnectionMode('p2p-webrtc');
          setStatusText('Direct P2P Encrypted Channel Ready');
          if (fallbackTimeoutRef.current) {
            clearTimeout(fallbackTimeoutRef.current);
            fallbackTimeoutRef.current = null;
          }
        } else if (state === 'failed' || state === 'disconnected') {
          switchToFallbackRelay();
        }
      },
      onDataChannelOpen: () => {
        setStatusText('Lossless Channel Ready. Drop files to transfer.');
      },
      onManifestReceived: (manifest) => {
        handleIncomingManifest(manifest);
      },
      onChunkReceived: (chunkIndex, payload) => {
        handleIncomingChunk(chunkIndex, payload);
      },
      onTransferComplete: () => {
        finishReceivedFile();
      },
      onIntegrityReport: (report) => {
        setIntegrityReport(report);
        setIsTransferring(false);
      },
    });

    webrtcRef.current = webrtc;

    webrtc.initPeerConnection((candidate) => {
      socketRef.current?.emit('webrtc:ice-candidate', {
        code: roomCodeRef.current,
        candidate,
      });
    });

    // Sender initiates WebRTC DataChannel and offer
    if (modeRef.current === 'sender') {
      webrtc.createDataChannel('losslessDrop');
      webrtc.createOffer().then((offer) => {
        socketRef.current?.emit('webrtc:offer', { code: roomCodeRef.current, sdp: offer });
      });

      // 8-second safety fallback: if P2P does not connect, use zero-storage memory relay
      fallbackTimeoutRef.current = setTimeout(() => {
        if (!webrtc.isChannelOpen()) {
          switchToFallbackRelay();
        }
      }, 8000);
    }
  }, [switchToFallbackRelay, handleIncomingManifest, handleIncomingChunk, finishReceivedFile]);

  // Initialize Socket.io connection and wire callbacks
  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = ioc({
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatusText('Ready');
      if (modeRef.current === 'receiver') {
        socket.emit('room:create');
      }
    });

    socket.on('room:created', (data) => {
      setRoomCode(data.code);
      roomCodeRef.current = data.code;
      setStatusText('Waiting for sender...');
    });

    socket.on('room:joined', (data) => {
      setRoomCode(data.code);
      roomCodeRef.current = data.code;
      setStatusText('Connecting to receiver...');
    });

    socket.on('peer:connected', () => {
      setPeerConnected(true);
      setStatusText('Peer connected. Establishing encrypted channel...');
      setupWebRTCConnection();
    });

    socket.on('peer:disconnected', (data) => {
      setPeerConnected(false);
      setStatusText(data.reason || 'Peer disconnected');
      webrtcRef.current?.close();
    });

    socket.on('webrtc:offer', async (data) => {
      if (webrtcRef.current) {
        try {
          const answer = await webrtcRef.current.handleOffer(data.sdp);
          socket.emit('webrtc:answer', { code: roomCodeRef.current, sdp: answer });
        } catch (e) {
          console.error('Failed to handle offer', e);
        }
      }
    });

    socket.on('webrtc:answer', async (data) => {
      if (webrtcRef.current) {
        try {
          await webrtcRef.current.handleAnswer(data.sdp);
        } catch (e) {
          console.error('Failed to handle answer', e);
        }
      }
    });

    socket.on('webrtc:ice-candidate', async (data) => {
      if (webrtcRef.current) {
        await webrtcRef.current.addIceCandidate(data.candidate);
      }
    });

    socket.on('relay:manifest', (manifest) => {
      handleIncomingManifest(manifest);
    });

    socket.on('relay:chunk', ({ chunkIndex, data }) => {
      handleIncomingChunk(chunkIndex, data);
    });

    socket.on('relay:complete', () => {
      finishReceivedFile();
    });

    socket.on('relay:integrity', (report) => {
      setIntegrityReport(report);
      setIsTransferring(false);
    });

    socket.on('error', (err) => {
      setErrorText(err.message);
    });

    return () => {
      socket.disconnect();
      webrtcRef.current?.close();
      cleanupDownloadUrl();
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
    };
  }, [setupWebRTCConnection, handleIncomingManifest, handleIncomingChunk, finishReceivedFile, cleanupDownloadUrl]);

  // Mode change handler
  const setMode = useCallback((newMode: ParticipantRole) => {
    if (newMode === modeRef.current) return;

    setModeState(newMode);
    modeRef.current = newMode;
    setErrorText(null);
    setPeerConnected(false);
    resetTransferState();
    webrtcRef.current?.close();

    if (newMode === 'receiver') {
      setRoomCode('');
      roomCodeRef.current = '';
      if (socketRef.current?.connected) {
        socketRef.current.emit('room:create');
      }
    } else {
      setRoomCode('');
      roomCodeRef.current = '';
      setSelectedFile(null);
      setStatusText('Enter 6-digit receiver code');
    }
  }, [resetTransferState]);

  // Join Room as Sender
  const joinRoom = useCallback((code: string) => {
    setErrorText(null);
    setRoomCode(code);
    roomCodeRef.current = code;
    socketRef.current?.emit('room:join', { code });
  }, []);

  // Create new room as Receiver
  const createNewRoom = useCallback(() => {
    setErrorText(null);
    resetTransferState();
    setPeerConnected(false);
    webrtcRef.current?.close();
    socketRef.current?.emit('room:create');
  }, [resetTransferState]);

  // Sender starts file transmission
  const sendFile = useCallback(async () => {
    if (!selectedFile) return;

    setIsTransferring(true);
    setStatusText('Hashing file losslessly...');
    setErrorText(null);

    const sha256 = await computeFileSha256(selectedFile);
    const totalChunks = calculateTotalChunks(selectedFile.size, DEFAULT_CHUNK_SIZE);

    const manifest: FileManifest = {
      type: 'MANIFEST',
      fileId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type || 'application/octet-stream',
      chunkSize: DEFAULT_CHUNK_SIZE,
      totalChunks,
      sha256,
    };

    speedCalcRef.current.start(selectedFile.size);

    if (connectionMode === 'p2p-webrtc' && webrtcRef.current?.isChannelOpen()) {
      webrtcRef.current.sendManifest(manifest);
      await webrtcRef.current.sendFileStream(selectedFile, (bytesSent) => {
        const stats = speedCalcRef.current.update(bytesSent);
        setTransferStats(stats);
      });
    } else {
      // Fallback relay transmission
      const currentCode = roomCodeRef.current;
      socketRef.current?.emit('relay:manifest', { code: currentCode, manifest });
      let offset = 0;
      let chunkIdx = 0;

      while (offset < selectedFile.size) {
        const slice = selectedFile.slice(offset, offset + DEFAULT_CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();

        socketRef.current?.emit('relay:chunk', {
          code: currentCode,
          chunkIndex: chunkIdx,
          totalChunks,
          data: buffer,
        });

        offset += buffer.byteLength;
        chunkIdx++;
        const stats = speedCalcRef.current.update(offset);
        setTransferStats(stats);

        // Yield to event loop every 16 chunks to prevent client socket buffer overflow
        if (chunkIdx % 16 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }

      socketRef.current?.emit('relay:complete', { code: currentCode, fileId: manifest.fileId });
    }
  }, [selectedFile, connectionMode]);

  return {
    mode,
    setMode,
    roomCode,
    peerConnected,
    connectionMode,
    statusText,
    errorText,
    selectedFile,
    setSelectedFile,
    incomingManifest,
    isTransferring,
    transferStats,
    integrityReport,
    downloadUrl,
    joinRoom,
    createNewRoom,
    sendFile,
  };
}
