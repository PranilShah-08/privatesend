import React, { useState } from 'react';
import { Copy, Check, RefreshCw, Radio } from 'lucide-react';
import type { ConnectionMode } from '../../../shared/types.js';

interface ReceiverCardProps {
  roomCode: string;
  peerConnected: boolean;
  connectionMode: ConnectionMode;
  onRefresh: () => void;
}

export const ReceiverCard: React.FC<ReceiverCardProps> = ({
  roomCode,
  peerConnected,
  connectionMode,
  onRefresh,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm text-center">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
        Receiver Room Code
      </div>

      <div className="my-6">
        {roomCode ? (
          <div className="flex items-center justify-center gap-3">
            <span className="font-mono text-4xl sm:text-5xl font-bold tracking-widest text-zinc-900 dark:text-white select-all">
              {roomCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy Room Code"
              className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
            >
              {copied ? (
                <Check className="w-5 h-5 text-emerald-500" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-4 text-zinc-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Generating secure code...</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-sm">
        {peerConnected ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Sender Connected • {connectionMode === 'p2p-webrtc' ? 'Direct P2P' : 'Relay'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <Radio className="w-4 h-4 animate-pulse text-zinc-400" />
            <span>Share this code with the sender. Waiting for connection...</span>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-center">
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Generate new code</span>
        </button>
      </div>
    </div>
  );
};
