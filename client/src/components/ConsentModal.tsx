import React from 'react';
import { Wifi, Check, X, Folder, File } from 'lucide-react';
import type { TransferConsentRequest } from '../../../shared/types.js';
import { formatBytes } from '../services/speedCalculator.js';

export interface ConsentModalProps {
  request: TransferConsentRequest | null;
  onAccept: () => void;
  onDecline: () => void;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({
  request,
  onAccept,
  onDecline,
}) => {
  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        {/* Header with Wi-Fi indicator */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Wifi className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Incoming Wi-Fi Request
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              from <span className="font-medium text-zinc-700 dark:text-zinc-300">{request.senderDeviceName}</span>
            </p>
          </div>
        </div>

        {/* Payload Summary */}
        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              {request.isFolder ? <Folder className="w-4 h-4 text-amber-500" /> : <File className="w-4 h-4 text-blue-500" />}
              {request.isFolder ? 'Folder' : 'Files'}:
            </span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {request.folderName || `${request.fileCount} ${request.fileCount === 1 ? 'file' : 'files'}`}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Total Size:</span>
            <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {formatBytes(request.totalBytes)}
            </span>
          </div>

          {request.firstFileName && (
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate pt-1 border-t border-zinc-200/40 dark:border-zinc-700/40">
              e.g. {request.firstFileName}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onDecline}
            className="flex-1 py-2.5 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Decline
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            Accept & Receive
          </button>
        </div>
      </div>
    </div>
  );
};
