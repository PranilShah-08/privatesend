import React, { useState, useRef } from 'react';
import { ArrowRight, FileUp, File as FileIcon, X, CheckCircle2, Lock } from 'lucide-react';
import { formatBytes } from '../services/speedCalculator.js';
import { normalizeRoomCode } from '../utils/codeValidator.js';

interface SenderCardProps {
  peerConnected: boolean;
  onJoinRoom: (code: string) => void;
  selectedFiles: File[];
  onSelectFiles: (files: File[]) => void;
  onSendFiles: (enableE2EE: boolean) => void;
  isTransferring: boolean;
  errorText: string | null;
}

export const SenderCard: React.FC<SenderCardProps> = ({
  peerConnected,
  onJoinRoom,
  selectedFiles,
  onSelectFiles,
  onSendFiles,
  isTransferring,
  errorText,
}) => {
  const [code, setCode] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [enableE2EE, setEnableE2EE] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
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
    // Reset file input so user can pick same file again if desired
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    onSelectFiles(updated);
  };

  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm">
      {!peerConnected ? (
        <form onSubmit={handleConnect} className="text-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
            Enter Receiver Room Code
          </div>

          <div className="my-6 max-w-xs mx-auto">
            <input
              type="text"
              inputMode="numeric"
              placeholder="000-000"
              maxLength={7}
              value={code}
              onChange={handleCodeChange}
              className="w-full text-center font-mono text-3xl sm:text-4xl font-bold tracking-widest py-3 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
            />
          </div>

          {errorText && (
            <div className="text-xs text-rose-500 mb-4 font-medium">
              {errorText}
            </div>
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
        <div>
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Connected to Receiver
              </span>
            </div>
            <span className="text-xs font-mono text-zinc-400">Room: {code}</span>
          </div>

          {/* E2EE Toggle */}
          <div className="flex items-center justify-between p-3 mb-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-500" />
              <div>
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  AES-256-GCM Encryption
                </span>
                <p className="text-[11px] text-zinc-400">Derived from room code • Zero keys stored</p>
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

          {selectedFiles.length === 0 ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-800/50'
                  : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              <FileUp className="w-8 h-8 mx-auto mb-3 text-zinc-400" />
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Multi-file batch • Any size • 100% Bit-for-bit lossless
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Queue List */}
              <div className="flex items-center justify-between text-xs text-zinc-400 font-medium px-1">
                <span>
                  {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected (
                  {formatBytes(totalBytes)})
                </span>
                {!isTransferring && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-zinc-900 dark:text-zinc-100 hover:underline"
                  >
                    + Add more
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 rounded-lg bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-200">
                        <FileIcon className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-medium text-zinc-900 dark:text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {formatBytes(file.size)} • {file.type || 'binary'}
                        </p>
                      </div>
                    </div>

                    {!isTransferring && (
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
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
                    : `Send ${selectedFiles.length > 1 ? `${selectedFiles.length} Files` : 'File'} Losslessly`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
