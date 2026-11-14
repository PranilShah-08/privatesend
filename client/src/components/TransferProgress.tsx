import React from 'react';
import { Activity, Clock } from 'lucide-react';
import { formatBytes } from '../services/speedCalculator.js';
import type { TransferProgressStats, FileManifest } from '../../../shared/types.js';

interface TransferProgressProps {
  stats: TransferProgressStats | null;
  manifest: FileManifest | null;
  isSender: boolean;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  stats,
  manifest,
  isSender,
}) => {
  if (!stats && !manifest) return null;

  const percentage = stats?.percentage ?? 0;
  const fileName = manifest?.fileName ?? 'File';
  const totalSize = manifest?.fileSize ?? stats?.totalBytes ?? 0;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="truncate max-w-[70%]">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
            {isSender ? `Sending: ${fileName}` : `Receiving: ${fileName}`}
          </p>
          <p className="text-xs text-zinc-400">
            {formatBytes(stats?.bytesTransferred ?? 0)} of {formatBytes(totalSize)}
          </p>
        </div>
        <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
          {percentage}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all duration-150 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Telemetry Row */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-zinc-400" />
          <span>{stats?.speedFormatted || '0 B/s'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span>ETA: {stats?.etaFormatted || '--'}</span>
        </div>
      </div>
    </div>
  );
};
