import { useState, useEffect, useRef, useCallback } from 'react';
import { PeerJSService } from '../services/peerjsService.js';
import { computeFileSha256 } from '../services/cryptoService.js';
import { SpeedCalculator } from '../services/speedCalculator.js';
import { calculateTotalChunks, DEFAULT_CHUNK_SIZE } from '../services/chunkerService.js';
import { generateRoomCode } from '../utils/codeValidator.js';
import type {
  ParticipantRole,
  FileManifest,
  TransferProgressStats,
  IntegrityReport,
  ConnectionMode,
} from '../../../shared/types.js';

export function useP2PTransfer() {
  const [mode, setModeState] = useState<ParticipantRole>('receiver');
  const [roomCode, setRoomCode] = useState<string>('');
  const [peerConnected, setPeerConnected] = useState<boolean>(false);
  const [connectionMode] = useState<ConnectionMode>('p2p-webrtc');
  const [statusText, setStatusText] = useState<string>('Initializing P2P...');
  const [errorText, setErrorText] = useState<string | null>(null);

  // File & Transfer States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [incomingManifest, setIncomingManifest] = useState<FileManifest | null>(null);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferStats, setTransferStats] = useState<TransferProgressStats | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // Mutable refs to prevent stale closure traps
  const modeRef = useRef<ParticipantRole>(mode);
  modeRef.current = mode;

  const roomCodeRef = useRef<string>(roomCode);
  roomCodeRef.current = roomCode;

  const incomingManifestRef = useRef<FileManifest | null>(incomingManifest);
  incomingManifestRef.current = incomingManifest;

  const downloadUrlRef = useRef<string | null>(downloadUrl);
  downloadUrlRef.current = downloadUrl;

  const peerServiceRef = useRef<PeerJSService | null>(null);
  const speedCalcRef = useRef<SpeedCalculator>(new SpeedCalculator());
  const receivedChunksRef = useRef<Map<number, ArrayBuffer>>(new Map());
  const totalReceivedBytesRef = useRef<number>(0);

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
      setErrorText(`Transfer failed: Missing chunks (${chunks.length}/${manifest.totalChunks}).`);
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
    peerServiceRef.current?.sendIntegrityReport(report);
  }, [cleanupDownloadUrl]);

  // Receiver room initializer
  const initializeReceiverRoom = useCallback(async () => {
    setErrorText(null);
    resetTransferState();
    setPeerConnected(false);

    const code = generateRoomCode();
    setRoomCode(code);
    roomCodeRef.current = code;
    setStatusText('Claiming room code...');

    try {
      await peerServiceRef.current?.initReceiver(code);
    } catch (err: any) {
      if (err.message === 'ROOM_CODE_TAKEN') {
        // Retry with another code
        initializeReceiverRoom();
      } else {
        setErrorText(err.message || 'Failed to initialize receiver room.');
      }
    }
  }, [resetTransferState]);

  // Setup PeerJS service instance
  useEffect(() => {
    const service = new PeerJSService({
      onReady: (code) => {
        setRoomCode(code);
        roomCodeRef.current = code;
        setStatusText('Waiting for sender...');
      },
      onPeerConnected: () => {
        setPeerConnected(true);
        setStatusText('Peer connected. Encrypted channel ready.');
      },
      onPeerDisconnected: () => {
        setPeerConnected(false);
        setStatusText('Peer disconnected.');
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
      onError: (err) => {
        setErrorText(err.message);
      },
      onStatusChange: (status) => {
        setStatusText(status);
      },
    });

    peerServiceRef.current = service;

    if (modeRef.current === 'receiver') {
      initializeReceiverRoom();
    }

    return () => {
      service.destroy();
      cleanupDownloadUrl();
    };
  }, [initializeReceiverRoom, handleIncomingManifest, handleIncomingChunk, finishReceivedFile, cleanupDownloadUrl]);

  // Mode change handler
  const setMode = useCallback((newMode: ParticipantRole) => {
    if (newMode === modeRef.current) return;

    setModeState(newMode);
    modeRef.current = newMode;
    setErrorText(null);
    setPeerConnected(false);
    resetTransferState();
    peerServiceRef.current?.destroy();

    if (newMode === 'receiver') {
      initializeReceiverRoom();
    } else {
      setRoomCode('');
      roomCodeRef.current = '';
      setSelectedFile(null);
      setStatusText('Enter 6-digit receiver code');
    }
  }, [resetTransferState, initializeReceiverRoom]);

  // Join Room as Sender
  const joinRoom = useCallback(async (code: string) => {
    setErrorText(null);
    setRoomCode(code);
    roomCodeRef.current = code;
    setStatusText('Connecting to receiver...');

    try {
      await peerServiceRef.current?.connectToReceiver(code);
    } catch (err: any) {
      setErrorText(err.message || 'Failed to connect to receiver.');
    }
  }, []);

  // Create new room as Receiver
  const createNewRoom = useCallback(() => {
    initializeReceiverRoom();
  }, [initializeReceiverRoom]);

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

    try {
      peerServiceRef.current?.sendManifest(manifest);
      await peerServiceRef.current?.sendFileStream(selectedFile, (bytesSent) => {
        const stats = speedCalcRef.current.update(bytesSent);
        setTransferStats(stats);
      });
    } catch (err: any) {
      setErrorText(err.message || 'Transfer failed.');
      setIsTransferring(false);
    }
  }, [selectedFile]);

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
