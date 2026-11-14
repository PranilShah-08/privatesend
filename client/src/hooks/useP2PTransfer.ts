import { useState, useEffect, useRef, useCallback } from 'react';
import { PeerJSService } from '../services/peerjsService.js';
import { computeFileSha256 } from '../services/cryptoService.js';
import { SpeedCalculator } from '../services/speedCalculator.js';
import { calculateTotalChunks, DEFAULT_CHUNK_SIZE } from '../services/chunkerService.js';
import { generateRoomCode } from '../utils/codeValidator.js';
import {
  deriveKeyFromRoomCode,
  encryptPayload,
  decryptPayload,
  DEFAULT_SALT,
  generateSalt,
  bytesToHex,
  hexToBytes,
  getChunkIv,
} from '../services/encryptionService.js';
import { zeroizeMapBuffers, revokeBlobUrls } from '../services/panicWipeService.js';
import { createInMemoryZip } from '../services/zipBundleService.js';
import type { BatchItemState } from '../components/BatchItemCard.js';
import type {
  ParticipantRole,
  FileManifest,
  BatchManifest,
  BatchItemManifest,
  TransferProgressStats,
  IntegrityReport,
  BatchIntegrityReport,
  ConnectionMode,
} from '../../../shared/types.js';

export function extractHashRoomCode(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash || '';
  const match = hash.match(/code=([A-Za-z0-9-]+)/i);
  if (match && match[1]) {
    const raw = match[1].replace(/[^A-Za-z0-9]/g, '');
    if (raw.length === 6) {
      return `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;
    }
  }
  return '';
}

export function useP2PTransfer() {
  const [mode, setModeState] = useState<ParticipantRole>(() => {
    return extractHashRoomCode() ? 'sender' : 'receiver';
  });
  const [roomCode, setRoomCode] = useState<string>(() => {
    return extractHashRoomCode();
  });
  const [peerConnected, setPeerConnected] = useState<boolean>(false);
  const [connectionMode] = useState<ConnectionMode>('p2p-webrtc');
  const [statusText, setStatusText] = useState<string>('Initializing P2P...');
  const [errorText, setErrorText] = useState<string | null>(null);

  // Multi-File & Batch Transfer States
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItemState[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [batchManifest, setBatchManifest] = useState<BatchManifest | null>(null);
  const [incomingManifest, setIncomingManifest] = useState<FileManifest | null>(null);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferStats, setTransferStats] = useState<TransferProgressStats | null>(null);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [batchIntegrityReport, setBatchIntegrityReport] = useState<BatchIntegrityReport | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [inspectItem, setInspectItem] = useState<BatchItemState | null>(null);

  // Version 2.1: Folder Streaming & Multi-User Broadcast States
  const [isBroadcastHost, setIsBroadcastHost] = useState<boolean>(false);
  const [connectedReceiversCount, setConnectedReceiversCount] = useState<number>(0);
  const [connectedReceiverIds, setConnectedReceiverIds] = useState<string[]>([]);
  const [isFolder, setIsFolder] = useState<boolean>(false);
  const [rootFolderName, setRootFolderName] = useState<string>('folder');
  const [zipBlobUrl, setZipBlobUrl] = useState<string | null>(null);

  // Mutable refs
  const modeRef = useRef<ParticipantRole>(mode);
  modeRef.current = mode;

  const isFolderRef = useRef<boolean>(isFolder);
  isFolderRef.current = isFolder;

  const rootFolderNameRef = useRef<string>(rootFolderName);
  rootFolderNameRef.current = rootFolderName;

  const isBroadcastHostRef = useRef<boolean>(isBroadcastHost);
  isBroadcastHostRef.current = isBroadcastHost;

  const roomCodeRef = useRef<string>(roomCode);
  roomCodeRef.current = roomCode;

  const batchManifestRef = useRef<BatchManifest | null>(batchManifest);
  batchManifestRef.current = batchManifest;

  const activeItemIndexRef = useRef<number>(activeItemIndex);
  activeItemIndexRef.current = activeItemIndex;

  const batchItemsRef = useRef<BatchItemState[]>(batchItems);
  batchItemsRef.current = batchItems;

  const peerServiceRef = useRef<PeerJSService | null>(null);
  const speedCalcRef = useRef<SpeedCalculator>(new SpeedCalculator());

  // Multi-file chunk storage: Map<fileIndex, Map<chunkIndex, ArrayBuffer>>
  const receivedChunksRef = useRef<Map<number, Map<number, ArrayBuffer>>>(new Map());
  const totalReceivedBytesRef = useRef<number>(0);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);
  const batchNonceRef = useRef<number>(0);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const pendingAckResolversRef = useRef<Map<number, () => void>>(new Map());

  // Cleanup helper for object URLs
  const cleanupAllBlobUrls = useCallback(() => {
    revokeBlobUrls(blobUrlsRef.current);
    blobUrlsRef.current.clear();
    setDownloadUrl(null);
    setZipBlobUrl(null);
  }, []);

  // Panic wipe session: immediate memory zeroization & active connection teardown
  const panicWipeSession = useCallback(() => {
    peerServiceRef.current?.destroy();
    setPeerConnected(false);

    for (const fileMap of receivedChunksRef.current.values()) {
      zeroizeMapBuffers(fileMap);
    }
    receivedChunksRef.current.clear();
    totalReceivedBytesRef.current = 0;
    cleanupAllBlobUrls();

    cryptoKeyRef.current = null;
    batchNonceRef.current = 0;
    pendingAckResolversRef.current.clear();

    setSelectedFiles([]);
    setBatchItems([]);
    setBatchManifest(null);
    setIncomingManifest(null);
    setIntegrityReport(null);
    setBatchIntegrityReport(null);
    setIsTransferring(false);
    setTransferStats(null);
    setInspectItem(null);
    setIsFolder(false);
    setRootFolderName('folder');
    setIsBroadcastHost(false);
    setConnectedReceiversCount(0);
    setConnectedReceiverIds([]);
    setStatusText('Session wiped. Connection terminated & memory zeroed.');
  }, [cleanupAllBlobUrls]);

  // Reset transfer state between rooms
  const resetTransferState = useCallback(() => {
    for (const fileMap of receivedChunksRef.current.values()) {
      zeroizeMapBuffers(fileMap);
    }
    receivedChunksRef.current.clear();
    totalReceivedBytesRef.current = 0;
    cleanupAllBlobUrls();
    pendingAckResolversRef.current.clear();

    setBatchItems([]);
    setBatchManifest(null);
    setIncomingManifest(null);
    setIntegrityReport(null);
    setBatchIntegrityReport(null);
    setIsTransferring(false);
    setTransferStats(null);
    setInspectItem(null);
    setZipBlobUrl(null);
  }, [cleanupAllBlobUrls]);

  // Receiver: incoming batch manifest handler
  const handleIncomingBatchManifest = useCallback(
    async (manifest: BatchManifest) => {
      resetTransferState();
      setBatchManifest(manifest);
      batchManifestRef.current = manifest;
      batchNonceRef.current = manifest.batchNonce ?? 0;
      setIsTransferring(true);
      setErrorText(null);
      setActiveItemIndex(0);
      activeItemIndexRef.current = 0;

      // Prepare encryption key if sender enabled E2EE with dynamic salt
      if (manifest.encrypted && roomCodeRef.current) {
        try {
          const salt = manifest.saltHex ? hexToBytes(manifest.saltHex) : DEFAULT_SALT;
          cryptoKeyRef.current = await deriveKeyFromRoomCode(roomCodeRef.current, salt);
        } catch (e) {
          console.error('Failed to derive receiver decryption key', e);
        }
      } else {
        cryptoKeyRef.current = null;
      }

      if (manifest.isFolder) {
        setIsFolder(true);
        isFolderRef.current = true;
        setRootFolderName(manifest.folderName || 'folder');
        rootFolderNameRef.current = manifest.folderName || 'folder';
      } else {
        setIsFolder(false);
        isFolderRef.current = false;
      }

      // Initialize batch items state
      const initialItems: BatchItemState[] = manifest.files.map((f, idx) => ({
        fileIndex: f.fileIndex,
        fileId: f.fileId,
        fileName: f.fileName,
        fileSize: f.fileSize,
        fileType: f.fileType,
        relativePath: f.relativePath,
        status: idx === 0 ? 'transferring' : 'pending',
        progressPercentage: 0,
      }));

      setBatchItems(initialItems);
      batchItemsRef.current = initialItems;

      // Single-file compatibility shim
      if (manifest.files.length > 0) {
        const first = manifest.files[0];
        setIncomingManifest({
          type: 'MANIFEST',
          fileId: first.fileId,
          fileName: first.fileName,
          fileSize: first.fileSize,
          fileType: first.fileType,
          chunkSize: first.chunkSize,
          totalChunks: first.totalChunks,
          sha256: first.sha256,
        });
      }

      speedCalcRef.current.start(manifest.totalBatchBytes);
      setStatusText(`Receiving batch: ${manifest.totalFiles} files...`);
    },
    [resetTransferState]
  );

  // Receiver: incoming single-file manifest handler (backward compatibility)
  const handleIncomingSingleManifest = useCallback(
    (manifest: FileManifest) => {
      const batchWrapper: BatchManifest = {
        type: 'BATCH_MANIFEST',
        batchId: manifest.fileId,
        totalFiles: 1,
        totalBatchBytes: manifest.fileSize,
        encrypted: false,
        files: [
          {
            type: 'MANIFEST',
            fileIndex: 0,
            fileId: manifest.fileId,
            fileName: manifest.fileName,
            fileSize: manifest.fileSize,
            fileType: manifest.fileType,
            chunkSize: manifest.chunkSize,
            totalChunks: manifest.totalChunks,
            sha256: manifest.sha256,
          },
        ],
      };
      handleIncomingBatchManifest(batchWrapper);
    },
    [handleIncomingBatchManifest]
  );

  // Receiver: incoming chunk handler with fileIndex partitioning
  const handleIncomingChunk = useCallback(
    (chunkIndex: number, payload: ArrayBuffer, fileIndex = 0) => {
      let fileMap = receivedChunksRef.current.get(fileIndex);
      if (!fileMap) {
        fileMap = new Map();
        receivedChunksRef.current.set(fileIndex, fileMap);
      }
      fileMap.set(chunkIndex, payload);
      totalReceivedBytesRef.current += payload.byteLength;

      const stats = speedCalcRef.current.update(totalReceivedBytesRef.current);
      setTransferStats(stats);

      // Update file-specific progress
      const targetManifest = batchManifestRef.current?.files[fileIndex];
      if (targetManifest) {
        const itemProgress = Math.min(
          100,
          Math.round(((chunkIndex + 1) / targetManifest.totalChunks) * 100)
        );
        setBatchItems((prev) =>
          prev.map((item, idx) =>
            idx === fileIndex ? { ...item, progressPercentage: itemProgress } : item
          )
        );
      }
    },
    []
  );

  // Receiver: finish current file in the batch
  const handleItemComplete = useCallback(
    async (fileIndex: number) => {
      const manifest = batchManifestRef.current;
      const fileManifest = manifest?.files[fileIndex];
      if (!fileManifest) return;

      const fileMap = receivedChunksRef.current.get(fileIndex);
      const rawChunks: ArrayBuffer[] = [];
      let missingChunk = false;

      for (let i = 0; i < fileManifest.totalChunks; i++) {
        const chunk = fileMap?.get(i);
        if (!chunk) {
          missingChunk = true;
          break;
        }
        rawChunks.push(chunk);
      }

      if (missingChunk) {
        setErrorText(
          `Transfer failed for "${fileManifest.fileName}": Missing chunks (${rawChunks.length}/${fileManifest.totalChunks}).`
        );
        setBatchItems((prev) =>
          prev.map((item, idx) =>
            idx === fileIndex ? { ...item, status: 'error', error: 'Missing chunks' } : item
          )
        );
        return;
      }

      // Decrypt chunks if E2EE is enabled using per-batch nonce
      const finalChunks: ArrayBuffer[] = [];
      if (manifest?.encrypted && cryptoKeyRef.current) {
        try {
          for (let i = 0; i < rawChunks.length; i++) {
            const iv = getChunkIv(i, fileIndex, batchNonceRef.current);
            const decrypted = await decryptPayload(rawChunks[i], cryptoKeyRef.current, iv);
            finalChunks.push(decrypted);
          }
        } catch (decErr) {
          setErrorText(
            `Decryption failed for "${fileManifest.fileName}". Authentication check failed.`
          );
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === fileIndex ? { ...item, status: 'error', error: 'Decryption failed' } : item
            )
          );
          return;
        }
      } else {
        finalChunks.push(...rawChunks);
      }

      // Assemble into Blob
      const assembledBlob = new Blob(finalChunks, { type: fileManifest.fileType });

      // Zeroize intermediate raw chunks in RAM for THIS file only
      if (fileMap) {
        zeroizeMapBuffers(fileMap);
        receivedChunksRef.current.delete(fileIndex);
      }

      // Verify SHA-256 bit-for-bit match
      const receiverSha256 = await computeFileSha256(assembledBlob);
      const isMatch = receiverSha256.toLowerCase() === fileManifest.sha256.toLowerCase();

      // Emit item acknowledgment to sender
      peerServiceRef.current?.sendItemAck(fileIndex);

      const report: IntegrityReport = {
        fileId: fileManifest.fileId,
        fileName: fileManifest.fileName,
        fileSize: fileManifest.fileSize,
        senderSha256: fileManifest.sha256,
        receiverSha256,
        isMatch,
        timestamp: Date.now(),
      };

      let url: string | undefined;
      if (isMatch) {
        url = URL.createObjectURL(assembledBlob);
        blobUrlsRef.current.add(url);
        if (fileIndex === 0) {
          setDownloadUrl(url);
          setIntegrityReport(report);
        }
      }

      const updatedBatchItems = batchItemsRef.current.map((item, idx) =>
        idx === fileIndex
          ? {
              ...item,
              status: isMatch ? ('completed' as const) : ('error' as const),
              integrityReport: report,
              downloadUrl: url,
              rawBlob: assembledBlob,
              progressPercentage: 100,
              error: isMatch ? undefined : 'Hash mismatch',
            }
          : idx === fileIndex + 1
          ? { ...item, status: 'transferring' as const }
          : item
      );

      batchItemsRef.current = updatedBatchItems;
      setBatchItems(updatedBatchItems);

      // Advance active pointer to next file
      setActiveItemIndex(fileIndex + 1);
      activeItemIndexRef.current = fileIndex + 1;
    },
    []
  );

  // Receiver: entire batch transfer finished
  const handleBatchTransferComplete = useCallback(async () => {
    const activeIdx = activeItemIndexRef.current;
    if (batchManifestRef.current && activeIdx < batchManifestRef.current.files.length) {
      await handleItemComplete(activeIdx);
    }

    setIsTransferring(false);
    setStatusText('All files received and verified bit-for-bit.');

    const reports: IntegrityReport[] = batchItemsRef.current
      .map((item) => item.integrityReport)
      .filter((r): r is IntegrityReport => Boolean(r));

    const isAllMatch = reports.length > 0 && reports.every((r) => r.isMatch);

    // If batch is a folder, create an in-memory zip bundle
    let createdZipUrl: string | null = null;
    if (batchManifestRef.current?.isFolder && isAllMatch) {
      try {
        const zipPayload: Array<{ relativePath: string; buffer: ArrayBuffer }> = [];
        for (const item of batchItemsRef.current) {
          if (item.rawBlob) {
            const buf = await item.rawBlob.arrayBuffer();
            zipPayload.push({
              relativePath: item.relativePath || item.fileName,
              buffer: buf,
            });
          }
        }
        if (zipPayload.length > 0) {
          const zipBlob = createInMemoryZip(zipPayload);
          createdZipUrl = URL.createObjectURL(zipBlob);
          blobUrlsRef.current.add(createdZipUrl);
          setZipBlobUrl(createdZipUrl);
        }
      } catch (zipErr) {
        console.error('Failed to create in-memory ZIP on batch complete', zipErr);
      }
    }

    const batchReport: BatchIntegrityReport = {
      batchId: batchManifestRef.current?.batchId || 'batch-1',
      totalFiles: reports.length,
      isFolder: batchManifestRef.current?.isFolder,
      folderName: batchManifestRef.current?.folderName,
      zipBlobUrl: createdZipUrl,
      allMatched: isAllMatch,
      items: reports.map((r, i) => ({
        fileId: r.fileId,
        fileName: r.fileName,
        fileSize: r.fileSize,
        relativePath: batchItemsRef.current[i]?.relativePath,
        senderSha256: r.senderSha256,
        receiverSha256: r.receiverSha256,
        isMatch: r.isMatch,
        downloadUrl: null,
      })),
      timestamp: Date.now(),
    };

    setBatchIntegrityReport(batchReport);
    peerServiceRef.current?.sendBatchIntegrityReport(batchReport);
  }, [handleItemComplete]);

  // Join Room as Sender
  const joinRoom = useCallback(async (code: string): Promise<boolean> => {
    setErrorText(null);
    setRoomCode(code);
    roomCodeRef.current = code;
    setStatusText('Connecting to receiver...');

    try {
      await peerServiceRef.current?.connectToReceiver(code);
      return true;
    } catch (err: any) {
      setErrorText(err.message || 'Failed to connect to receiver.');
      return false;
    }
  }, []);

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
      onPeerConnected: (peerId) => {
        setPeerConnected(true);
        if (peerId) {
          setConnectedReceiverIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));
        }
        setConnectedReceiversCount((prev) => prev + 1);
        setStatusText(
          isBroadcastHostRef.current
            ? 'Receiver connected to broadcast session.'
            : 'Peer connected. Direct encrypted channel ready.'
        );
      },
      onPeerDisconnected: (peerId) => {
        if (peerId) {
          setConnectedReceiverIds((prev) => prev.filter((id) => id !== peerId));
        }
        setConnectedReceiversCount((prev) => {
          const next = Math.max(0, prev - 1);
          if (next === 0 && !isBroadcastHostRef.current) {
            setPeerConnected(false);
          }
          return next;
        });
        setStatusText('Peer disconnected.');
      },
      onManifestReceived: (manifest) => {
        handleIncomingSingleManifest(manifest);
      },
      onBatchManifestReceived: (manifest) => {
        handleIncomingBatchManifest(manifest);
      },
      onChunkReceived: (chunkIndex, payload, fileIndex = 0) => {
        handleIncomingChunk(chunkIndex, payload, fileIndex);
      },
      onItemComplete: (fileIndex) => {
        handleItemComplete(fileIndex);
      },
      onItemAck: (fileIndex) => {
        const resolver = pendingAckResolversRef.current.get(fileIndex);
        if (resolver) {
          resolver();
          pendingAckResolversRef.current.delete(fileIndex);
        }
      },
      onTransferComplete: () => {
        handleBatchTransferComplete();
      },
      onIntegrityReport: (report) => {
        setIntegrityReport(report);
        setIsTransferring(false);
      },
      onBatchIntegrityReport: (report) => {
        setBatchIntegrityReport(report);
        setIsTransferring(false);
        setBatchItems((prev) =>
          prev.map((item, idx) => {
            const itemReport = report.items[idx];
            return {
              ...item,
              status: itemReport?.isMatch ? 'completed' : 'error',
              integrityReport: itemReport
                ? {
                    fileId: itemReport.fileId,
                    fileName: itemReport.fileName,
                    fileSize: itemReport.fileSize,
                    senderSha256: itemReport.senderSha256,
                    receiverSha256: itemReport.receiverSha256,
                    isMatch: itemReport.isMatch,
                    timestamp: report.timestamp,
                  }
                : undefined,
            };
          })
        );
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
    } else if (roomCodeRef.current) {
      joinRoom(roomCodeRef.current);
    }

    return () => {
      service.destroy();
      cleanupAllBlobUrls();
    };
  }, [
    initializeReceiverRoom,
    joinRoom,
    handleIncomingSingleManifest,
    handleIncomingBatchManifest,
    handleIncomingChunk,
    handleItemComplete,
    handleBatchTransferComplete,
    cleanupAllBlobUrls,
  ]);

  // Mode change handler
  const setMode = useCallback(
    (newMode: ParticipantRole) => {
      if (newMode === modeRef.current) return;

      setModeState(newMode);
      modeRef.current = newMode;
      setErrorText(null);
      setPeerConnected(false);
      setIsBroadcastHost(false);
      setConnectedReceiversCount(0);
      setConnectedReceiverIds([]);
      resetTransferState();
      peerServiceRef.current?.destroy();

      if (newMode === 'receiver') {
        initializeReceiverRoom();
      } else {
        setRoomCode('');
        roomCodeRef.current = '';
        setSelectedFiles([]);
        setStatusText('Enter 6-digit receiver code');
      }
    },
    [resetTransferState, initializeReceiverRoom]
  );

  // URL hash pairing listener (e.g. #code=123-456)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const code = extractHashRoomCode();
      if (code) {
        setMode('sender');
        joinRoom(code);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [joinRoom, setMode]);

  // Create new room as Receiver
  const createNewRoom = useCallback(() => {
    initializeReceiverRoom();
  }, [initializeReceiverRoom]);

  // Version 2.1: Initialize 1-to-Many Broadcast Session as Sender
  const initBroadcastSession = useCallback(async () => {
    setErrorText(null);
    resetTransferState();
    setIsBroadcastHost(true);
    isBroadcastHostRef.current = true;
    setModeState('sender');
    modeRef.current = 'sender';
    setConnectedReceiversCount(0);
    setConnectedReceiverIds([]);

    const code = generateRoomCode();
    setRoomCode(code);
    roomCodeRef.current = code;
    setStatusText('Claiming broadcast session room code...');

    try {
      await peerServiceRef.current?.initBroadcastHost(code);
    } catch (err: any) {
      if (err.message === 'ROOM_CODE_TAKEN') {
        initBroadcastSession();
      } else {
        setErrorText(err.message || 'Failed to initialize broadcast session.');
      }
    }
  }, [resetTransferState]);

  const cancelBroadcastSession = useCallback(() => {
    setIsBroadcastHost(false);
    isBroadcastHostRef.current = false;
    setConnectedReceiversCount(0);
    setConnectedReceiverIds([]);
    setRoomCode('');
    roomCodeRef.current = '';
    peerServiceRef.current?.destroy();
    setStatusText('Broadcast session ended.');
  }, []);

  // Multi-file & Folder selection handlers
  const handleSelectFiles = useCallback(
    (files: File[], isDir = false, dirName = '') => {
      setSelectedFiles(files);
      setIsFolder(isDir);
      isFolderRef.current = isDir;

      if (dirName) {
        setRootFolderName(dirName);
        rootFolderNameRef.current = dirName;
      } else if (files.length > 0 && (files[0] as any).relativePath?.includes('/')) {
        const parts = (files[0] as any).relativePath.split('/');
        setRootFolderName(parts[0]);
        rootFolderNameRef.current = parts[0];
        setIsFolder(true);
        isFolderRef.current = true;
      } else {
        setIsFolder(false);
        isFolderRef.current = false;
      }

      const items: BatchItemState[] = files.map((f, idx) => ({
        fileIndex: idx,
        fileId: `file-${idx}`,
        fileName: f.name,
        fileSize: f.size,
        fileType: f.type || 'application/octet-stream',
        relativePath: (f as any).relativePath || f.name,
        status: 'pending',
        progressPercentage: 0,
        rawBlob: f,
      }));
      setBatchItems(items);
    },
    []
  );

  const handleSelectFolder = useCallback(
    (files: File[], folderName: string) => {
      handleSelectFiles(files, true, folderName);
    },
    [handleSelectFiles]
  );

  const handleSelectSingleFile = useCallback(
    (file: File | null) => {
      handleSelectFiles(file ? [file] : []);
    },
    [handleSelectFiles]
  );

  // Sender starts file transmission
  const sendFiles = useCallback(
    async (enableE2EE = true) => {
      if (selectedFiles.length === 0) return;

      if (!peerServiceRef.current?.isConnected()) {
        setErrorText('Cannot send: No active peer connection.');
        setIsTransferring(false);
        return;
      }

      setIsTransferring(true);
      setStatusText('Hashing files bit-for-bit with SHA-256...');
      setErrorText(null);

      // Derive encryption key if E2EE enabled using dynamic cryptographically random salt
      let key: CryptoKey | null = null;
      let saltHex: string | undefined = undefined;
      const batchNonce = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
      batchNonceRef.current = batchNonce;

      if (enableE2EE && roomCodeRef.current) {
        try {
          const salt = generateSalt();
          saltHex = bytesToHex(salt);
          key = await deriveKeyFromRoomCode(roomCodeRef.current, salt);
        } catch (e) {
          console.error('Failed to derive encryption key', e);
        }
      }

      // Step 1: Compute bit-for-bit SHA-256 for all files
      const itemManifests: BatchItemManifest[] = [];
      let totalBytes = 0;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setBatchItems((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: 'hashing', progressPercentage: 50 } : item
          )
        );

        const sha256 = await computeFileSha256(file);
        const totalChunks = calculateTotalChunks(file.size, DEFAULT_CHUNK_SIZE);
        totalBytes += file.size;

        const relativePath = (file as any).relativePath || file.name;

        itemManifests.push({
          type: 'MANIFEST',
          fileIndex: i,
          fileId: `f-${i}-${Date.now()}`,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          relativePath,
          chunkSize: DEFAULT_CHUNK_SIZE,
          totalChunks,
          sha256,
        });

        setBatchItems((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: 'pending', progressPercentage: 100 } : item
          )
        );
      }

      const batch: BatchManifest = {
        type: 'BATCH_MANIFEST',
        batchId: `batch-${Date.now()}`,
        totalFiles: selectedFiles.length,
        totalBatchBytes: totalBytes,
        encrypted: enableE2EE,
        saltHex,
        batchNonce,
        isFolder: isFolderRef.current,
        folderName: isFolderRef.current ? rootFolderNameRef.current : undefined,
        files: itemManifests,
      };

      setBatchManifest(batch);
      speedCalcRef.current.start(totalBytes);
      let cumulativeBytesSent = 0;

      try {
        // Send batch manifest to receiver
        peerServiceRef.current?.sendBatchManifest(batch);

        // Step 2: Stream chunks for each file
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];

          setActiveItemIndex(i);
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: 'transferring', progressPercentage: 0 } : item
            )
          );

          let offset = 0;
          let chunkIndex = 0;

          while (offset < file.size) {
            const slice = file.slice(offset, offset + DEFAULT_CHUNK_SIZE);
            const buffer = await slice.arrayBuffer();

            // Encrypt payload if E2EE enabled
            let chunkData = buffer;
            if (enableE2EE && key) {
              const iv = getChunkIv(chunkIndex, i, batchNonce);
              chunkData = await encryptPayload(buffer, key, iv);
            }

            peerServiceRef.current?.sendBatchChunk(i, chunkIndex, chunkData);

            offset += buffer.byteLength;
            cumulativeBytesSent += buffer.byteLength;
            chunkIndex++;

            const stats = speedCalcRef.current.update(cumulativeBytesSent);
            setTransferStats(stats);

            const fileProgress = Math.min(100, Math.round((offset / file.size) * 100));
            setBatchItems((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, progressPercentage: fileProgress } : item
              )
            );

            // Yield to browser event loop
            if (chunkIndex % 16 === 0) {
              await new Promise((r) => setTimeout(r, 4));
            }
          }

          // File complete
          peerServiceRef.current?.sendItemComplete(i);
          setBatchItems((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: 'verifying', progressPercentage: 100 } : item
            )
          );

          // If another file follows, wait for receiver acknowledgment before proceeding
          if (i < selectedFiles.length - 1) {
            await new Promise<void>((resolve) => {
              const timer = setTimeout(() => resolve(), 15000);
              pendingAckResolversRef.current.set(i, () => {
                clearTimeout(timer);
                resolve();
              });
            });
          }
        }

        // Entire batch complete
        peerServiceRef.current?.sendTransferComplete();
        setStatusText('Transfer complete. Awaiting peer cryptographic verification report...');
      } catch (err: any) {
        setErrorText(err.message || 'Batch transfer failed.');
        setIsTransferring(false);
      }
    },
    [selectedFiles]
  );

  return {
    mode,
    setMode,
    roomCode,
    peerConnected,
    connectionMode,
    statusText,
    errorText,
    selectedFiles,
    setSelectedFiles: handleSelectFiles,
    selectedFile: selectedFiles[0] || null,
    setSelectedFile: handleSelectSingleFile,
    batchItems,
    activeItemIndex,
    batchManifest,
    incomingManifest,
    isTransferring,
    transferStats,
    integrityReport,
    batchIntegrityReport,
    downloadUrl,
    inspectItem,
    setInspectItem,
    joinRoom,
    createNewRoom,
    sendFiles,
    sendFile: () => sendFiles(true),
    panicWipeSession,
    // Version 2.1: Folder & Broadcast extensions
    isBroadcastHost,
    connectedReceiversCount,
    connectedReceiverIds,
    initBroadcastSession,
    cancelBroadcastSession,
    isFolder,
    rootFolderName,
    zipBlobUrl,
    setSelectedFolder: handleSelectFolder,
  };
}
