export type ParticipantRole = 'receiver' | 'sender';

export type RoomStatus = 'waiting' | 'locked' | 'transferring' | 'completed' | 'closed';

export interface RoomInfo {
  code: string;
  receiverSocketId: string;
  senderSocketId?: string;
  createdAt: number;
  expiresAt: number;
  status: RoomStatus;
}

export interface FileManifest {
  type: 'MANIFEST';
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkSize: number;
  totalChunks: number;
  sha256: string;
  encrypted?: boolean;
  saltHex?: string;
}

export interface TransferProgressStats {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  speedBps: number;
  speedFormatted: string;
  etaSeconds: number;
  etaFormatted: string;
}

export interface IntegrityReport {
  fileId: string;
  fileName: string;
  fileSize: number;
  senderSha256: string;
  receiverSha256: string;
  isMatch: boolean;
  timestamp: number;
}

export type ConnectionMode = 'p2p-webrtc' | 'fallback-relay';

// Version 2: Multi-File Batch Transfer Contracts
export interface BatchItemManifest extends FileManifest {
  fileIndex: number;
}

export interface BatchManifest {
  type: 'BATCH_MANIFEST';
  batchId: string;
  totalFiles: number;
  totalBatchBytes: number;
  encrypted: boolean;
  saltHex?: string;
  batchNonce?: number;
  files: BatchItemManifest[];
}

export interface BatchProgressStats {
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  currentFileBytesTransferred: number;
  currentFileTotalBytes: number;
  batchBytesTransferred: number;
  batchTotalBytes: number;
  overallPercentage: number;
  speedBps: number;
  speedFormatted: string;
  etaSeconds: number;
  etaFormatted: string;
}

export interface BatchIntegrityReport {
  batchId: string;
  totalFiles: number;
  items: Array<{
    fileId: string;
    fileName: string;
    fileSize: number;
    senderSha256: string;
    receiverSha256: string;
    isMatch: boolean;
    downloadUrl: string | null;
  }>;
  allMatched: boolean;
  timestamp: number;
}

// Version 2: Ephemeral In-Memory AI Document Inspector
export interface AIInspectRequest {
  documentText: string;
  fileName: string;
  query?: string;
  similarityTopK?: number;
}

export interface AIInspectResponse {
  summary: string;
  keyTopics: string[];
  detectedLanguage?: string;
  answer?: string;
  sampleEntities?: string[];
  audit: {
    zeroDiskPersistence: boolean;
    storageMode: string;
    ramFlushed: boolean;
  };
}

// Socket.io Events
export interface ServerToClientEvents {
  'room:created': (data: { code: string; expiresAt: number }) => void;
  'room:joined': (data: { code: string; role: ParticipantRole }) => void;
  'peer:connected': (data: { role: ParticipantRole }) => void;
  'peer:disconnected': (data: { reason: string }) => void;
  'webrtc:offer': (data: { sdp: any }) => void;
  'webrtc:answer': (data: { sdp: any }) => void;
  'webrtc:ice-candidate': (data: { candidate: any }) => void;
  'relay:chunk': (data: { chunkIndex: number; totalChunks: number; data: ArrayBuffer }) => void;
  'relay:manifest': (data: FileManifest) => void;
  'relay:batch-manifest': (data: BatchManifest) => void;
  'relay:complete': (data: { fileId: string }) => void;
  'relay:integrity': (data: IntegrityReport) => void;
  'relay:batch-integrity': (data: BatchIntegrityReport) => void;
  'error': (data: { message: string; code: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': () => void;
  'room:join': (data: { code: string }) => void;
  'webrtc:offer': (data: { code: string; sdp: any }) => void;
  'webrtc:answer': (data: { code: string; sdp: any }) => void;
  'webrtc:ice-candidate': (data: { code: string; candidate: any }) => void;
  'relay:chunk': (data: { code: string; chunkIndex: number; totalChunks: number; data: ArrayBuffer }) => void;
  'relay:manifest': (data: { code: string; manifest: FileManifest }) => void;
  'relay:batch-manifest': (data: { code: string; manifest: BatchManifest }) => void;
  'relay:complete': (data: { code: string; fileId: string }) => void;
  'relay:integrity': (data: { code: string; report: IntegrityReport }) => void;
  'relay:batch-integrity': (data: { code: string; report: BatchIntegrityReport }) => void;
  'room:leave': () => void;
}
