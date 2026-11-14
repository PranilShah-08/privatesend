import React from 'react';
import {
  File as FileIcon,
  CheckCircle2,
  AlertTriangle,
  Download,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { formatBytes } from '../services/speedCalculator.js';
import type { IntegrityReport } from '../../../shared/types.js';

export interface BatchItemState {
  fileIndex: number;
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  relativePath?: string;
  status: 'pending' | 'hashing' | 'transferring' | 'verifying' | 'completed' | 'error';
  progressPercentage: number;
  integrityReport?: IntegrityReport;
  downloadUrl?: string;
  error?: string;
  rawBlob?: Blob;
}

interface BatchItemCardProps {
  item: BatchItemState;
  onInspectAI?: (item: BatchItemState) => void;
}

export const BatchItemCard: React.FC<BatchItemCardProps> = ({ item, onInspectAI }) => {
  const isComplete = item.status === 'completed';
  const isMatch = item.integrityReport?.isMatch ?? true;

  const canInspect =
    Boolean(item.rawBlob || item.downloadUrl) &&
    (item.fileType.includes('text') ||
      item.fileType.includes('pdf') ||
      item.fileType.includes('json') ||
      item.fileType.includes('markdown') ||
      item.fileName.endsWith('.txt') ||
      item.fileName.endsWith('.md') ||
      item.fileName.endsWith('.json') ||
      item.fileName.endsWith('.pdf') ||
      item.fileName.endsWith('.csv') ||
      item.fileName.endsWith('.ts') ||
      item.fileName.endsWith('.js') ||
      item.fileName.endsWith('.rs') ||
      item.fileName.endsWith('.py'));

  return (
    <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-200 shrink-0">
            <FileIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
              {item.fileName}
            </p>
            {item.relativePath && item.relativePath !== item.fileName && (
              <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 truncate">
                {item.relativePath}
              </p>
            )}
            <p className="text-[11px] text-zinc-400">
              {formatBytes(item.fileSize)} •{' '}
              {item.fileType ? item.fileType.split('/')[1] || item.fileType : 'binary'}
            </p>
          </div>
        </div>

        {/* Status / Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {item.status === 'pending' && (
            <span className="text-[11px] font-medium text-zinc-400">Queued</span>
          )}

          {(item.status === 'hashing' || item.status === 'transferring' || item.status === 'verifying') && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              <span>{item.progressPercentage}%</span>
            </div>
          )}

          {isComplete && isMatch && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Verified</span>
              </div>

              {canInspect && onInspectAI && (
                <button
                  type="button"
                  onClick={() => onInspectAI(item)}
                  title="Ephemeral AI Inspect"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-purple-500" />
                  <span>AI Inspect</span>
                </button>
              )}

              {item.downloadUrl && (
                <a
                  href={item.downloadUrl}
                  download={item.fileName}
                  title="Download File"
                  className="p-1.5 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {item.status === 'error' && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-rose-500">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <span>Failed</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar for In-Progress Item */}
      {(item.status === 'transferring' || item.status === 'hashing') && (
        <div className="mt-2.5 w-full h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all duration-150"
            style={{ width: `${item.progressPercentage}%` }}
          />
        </div>
      )}

      {/* SHA-256 Hash display on completion */}
      {isComplete && item.integrityReport && (
        <div className="mt-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50 flex items-center justify-between text-[10px] font-mono text-zinc-400">
          <span className="truncate max-w-[200px]">SHA: {item.integrityReport.receiverSha256}</span>
          <span className="text-emerald-500 font-semibold">100% Match</span>
        </div>
      )}
    </div>
  );
};
