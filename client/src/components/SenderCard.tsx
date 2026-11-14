import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowRight,
  FileUp,
  File as FileIcon,
  X,
  CheckCircle2,
  Lock,
  Folder,
  Radio,
  QrCode,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';
import { formatBytes } from '../services/speedCalculator.js';
import { normalizeRoomCode } from '../utils/codeValidator.js';
import { QRCodeModal } from './QRCodeModal.js';
import { BroadcastRoster } from './BroadcastRoster.js';
import {
  traverseFileSystemEntry,
  extractFilesFromFolderInput,
} from '../services/folderTraversalService.js';

interface SenderCardProps {
  peerConnected: boolean;
  onJoinRoom: (code: string) => void;
  selectedFiles: File[];
  onSelectFiles: (files: File[]) => void;
  onSendFiles: (enableE2EE: boolean) => void;
  isTransferring: boolean;
  errorText: string | null;
  // Version 2.1 additions:
  isBroadcastHost?: boolean;
  broadcastRoomCode?: string;
  connectedReceiversCount?: number;
  receiverIds?: string[];
  onInitBroadcast?: () => void;
  onCancelBroadcast?: () => void;
  isFolder?: boolean;
  folderName?: string;
  onSelectFolder?: (files: File[], folderName: string) => void;
}

export const SenderCard: React.FC<SenderCardProps> = ({
  peerConnected,
  onJoinRoom,
  selectedFiles,
  onSelectFiles,
  onSendFiles,
  isTransferring,
  errorText,
  isBroadcastHost = false,
  broadcastRoomCode = '',
  connectedReceiversCount = 0,
  receiverIds = [],
  onInitBroadcast,
  onCancelBroadcast,
  isFolder = false,
  folderName = '',
  onSelectFolder,
}) => {
  const [sendType, setSendType] = useState<'direct' | 'broadcast'>(
    isBroadcastHost ? 'broadcast' : 'direct'
  );
  const [code, setCode] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [enableE2EE, setEnableE2EE] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isBroadcastHost) {
      setSendType('broadcast');
    }
  }, [isBroadcastHost]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = normalizeRoomCode(e.target.value);
    setCode(formatted);
  };

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length >= 6) {
      onJoinRoom(code);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // Asynchronously inspect dropped items for directories
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const traversedList: File[] = [];
      let detectedDir = false;
      let detectedDirName = '';

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof (item as any).webkitGetAsEntry === 'function') {
          const entry = (item as any).webkitGetAsEntry();
          if (entry) {
            if (entry.isDirectory) {
              detectedDir = true;
              if (!detectedDirName) detectedDirName = entry.name;
            }
            const results = await traverseFileSystemEntry(entry);
            for (const r of results) {
              (r.file as any).relativePath = r.relativePath;
              traversedList.push(r.file);
            }
          }
        }
      }

      if (traversedList.length > 0) {
        if (detectedDir && onSelectFolder) {
          onSelectFolder([...selectedFiles, ...traversedList], detectedDirName);
        } else {
          onSelectFiles([...selectedFiles, ...traversedList]);
        }
        return;
      }
    }

    // Fallback to standard files list
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      onSelectFiles([...selectedFiles, ...newFiles]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      onSelectFiles([...selectedFiles, ...newFiles]);
    }
    e.target.value = '';
  };

  const handleFolderInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const traversed = extractFilesFromFolderInput(files);
      const fileList: File[] = [];
      let rootName = 'folder';

      for (const t of traversed) {
        (t.file as any).relativePath = t.relativePath;
        fileList.push(t.file);
        if (t.relativePath.includes('/')) {
          rootName = t.relativePath.split('/')[0];
        }
      }

      if (onSelectFolder) {
        onSelectFolder([...selectedFiles, ...fileList], rootName);
      } else {
        onSelectFiles([...selectedFiles, ...fileList]);
      }
    }
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    onSelectFiles(updated);
  };

  const clearAllFiles = () => {
    onSelectFiles([]);
  };

  const handleCopyCode = () => {
    const targetCode = broadcastRoomCode || code;
    if (!targetCode) return;
    navigator.clipboard.writeText(targetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      {/* Hidden inputs for Files and Folders */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFolderInput}
      />

      {/* 1. File & Folder Selection (ALWAYS AVAILABLE) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Files & Folders to Send
          </span>
          {selectedFiles.length > 0 && !isTransferring && (
            <button
              type="button"
              onClick={clearAllFiles}
              className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Folder badge if a directory was picked/dropped */}
        {isFolder && selectedFiles.length > 0 && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/80 text-xs">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 min-w-0">
              <Folder className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-semibold truncate">Folder: {folderName}</span>
              <span className="text-[11px] opacity-80 shrink-0">
                ({selectedFiles.length} files • {formatBytes(totalBytes)})
              </span>
            </div>
          </div>
        )}

        {/* Drag & Drop Zone when empty */}
        {selectedFiles.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isDragging
                ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-800/50'
                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
            }`}
          >
            <FileUp className="w-8 h-8 mx-auto mb-3 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Drag and drop files or a folder here
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Preserves folder structure • 100% Bit-for-bit lossless
            </p>

            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-1.5 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                Browse Files
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="py-1.5 px-3 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-amber-600 dark:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Browse Folder</span>
              </button>
            </div>
          </div>
        ) : (
          /* File Queue List when files are selected */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-medium px-1">
              <span>
                {selectedFiles.length} {selectedFiles.length === 1 ? 'item' : 'items'} selected (
                {formatBytes(totalBytes)})
              </span>
              {!isTransferring && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-zinc-900 dark:text-zinc-100 hover:underline"
                  >
                    + Add Files
                  </button>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Folder className="w-3 h-3" />
                    <span>+ Add Folder</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {selectedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="p-1.5 rounded-lg bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-200 shrink-0">
                      <FileIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-xs font-medium text-zinc-900 dark:text-white truncate">
                        {(file as any).relativePath || file.name}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {formatBytes(file.size)} • {file.type || 'binary'}
                      </p>
                    </div>
                  </div>

                  {!isTransferring && (
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. E2EE Encryption Toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-500" />
          <div>
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
              AES-256-GCM Encryption
            </span>
            <p className="text-[11px] text-zinc-400">
              Derived from session code • Zero keys stored
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enableE2EE}
            onChange={(e) => setEnableE2EE(e.target.checked)}
            disabled={isTransferring}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-zinc-600 peer-checked:bg-zinc-900 dark:peer-checked:bg-white"></div>
        </label>
      </div>

      {/* 3. Transmission Mode & Connection Controls */}
      <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        {!peerConnected && !isBroadcastHost && (
          <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-800/80 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setSendType('direct')}
              className={`flex-1 py-1.5 rounded-lg transition-all ${
                sendType === 'direct'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Direct (1:1)
            </button>
            <button
              type="button"
              onClick={() => setSendType('broadcast')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                sendType === 'broadcast'
                  ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Broadcast (1:Many)</span>
            </button>
          </div>
        )}

        {/* Mode A: Direct 1-to-1 Mode */}
        {sendType === 'direct' && (
          <div>
            {!peerConnected ? (
              <form onSubmit={handleConnect} className="text-center space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Enter Receiver Room Code
                </div>

                <div className="max-w-xs mx-auto">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="000-000"
                    maxLength={7}
                    value={code}
                    onChange={handleCodeChange}
                    className="w-full text-center font-mono text-3xl font-bold tracking-widest py-2.5 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                  />
                </div>

                {errorText && (
                  <div className="text-xs text-rose-500 font-medium">{errorText}</div>
                )}

                <button
                  type="submit"
                  disabled={code.replace(/\D/g, '').length < 6}
                  className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-medium text-sm text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <span>Connect to Receiver</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Connected to Receiver
                    </span>
                  </div>
                  <span className="text-xs font-mono text-zinc-400">Room: {code}</span>
                </div>

                <button
                  type="button"
                  disabled={isTransferring || selectedFiles.length === 0}
                  onClick={() => onSendFiles(enableE2EE)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-medium text-sm text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <span>
                    {isTransferring
                      ? 'Transferring...'
                      : selectedFiles.length === 0
                      ? 'Select files or folder above to send'
                      : `Send ${
                          isFolder
                            ? 'Folder'
                            : selectedFiles.length > 1
                            ? `${selectedFiles.length} Files`
                            : 'File'
                        } Losslessly`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mode B: Broadcast 1-to-Many Mode */}
        {sendType === 'broadcast' && (
          <div>
            {!isBroadcastHost ? (
              <div className="text-center py-2 space-y-3">
                <div className="w-10 h-10 mx-auto rounded-xl bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Host Broadcast Session
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
                    Share one QR code or session code with multiple receivers. Everyone receives files simultaneously in RAM.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onInitBroadcast}
                  className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl font-medium text-sm text-white bg-purple-600 hover:bg-purple-500 transition-all shadow-sm"
                >
                  <Radio className="w-4 h-4" />
                  <span>Start Broadcast Session</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
                    </span>
                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                      Broadcasting Session Active
                    </span>
                  </div>

                  {onCancelBroadcast && !isTransferring && (
                    <button
                      type="button"
                      onClick={onCancelBroadcast}
                      className="text-xs text-zinc-400 hover:text-rose-500 transition-colors"
                    >
                      End Session
                    </button>
                  )}
                </div>

                <div className="text-center py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Session Code & QR
                  </span>
                  <div className="flex items-center justify-center gap-3 mt-1">
                    <span className="font-mono text-3xl sm:text-4xl font-bold tracking-widest text-zinc-900 dark:text-white">
                      {broadcastRoomCode}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        title="Copy Code"
                        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQr(true)}
                        title="Show QR Code"
                        className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <BroadcastRoster
                  receiversCount={connectedReceiversCount}
                  receiverIds={receiverIds}
                  isTransferring={isTransferring}
                />

                <button
                  type="button"
                  disabled={
                    isTransferring ||
                    selectedFiles.length === 0 ||
                    connectedReceiversCount === 0
                  }
                  onClick={() => onSendFiles(enableE2EE)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-medium text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  <span>
                    {isTransferring
                      ? 'Streaming to all receivers...'
                      : selectedFiles.length === 0
                      ? 'Select files or folder above to broadcast'
                      : connectedReceiversCount === 0
                      ? 'Waiting for receivers to connect...'
                      : `Broadcast ${
                          isFolder
                            ? 'Folder'
                            : selectedFiles.length > 1
                            ? `${selectedFiles.length} Files`
                            : 'File'
                        } to ${connectedReceiversCount} ${
                          connectedReceiversCount === 1 ? 'Peer' : 'Peers'
                        }`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* QR Code Modal for Broadcast Host */}
      <QRCodeModal
        isOpen={showQr}
        roomCode={broadcastRoomCode || code}
        onClose={() => setShowQr(false)}
      />
    </div>
  );
};
