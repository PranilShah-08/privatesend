import React, { useState } from 'react';
import { Copy, Check, RefreshCw, Radio, QrCode, ArrowRight } from 'lucide-react';
import { QRCodeModal } from './QRCodeModal.js';
import { normalizeRoomCode } from '../utils/codeValidator.js';
import type { ConnectionMode } from '../../../shared/types.js';

interface ReceiverCardProps {
  roomCode: string;
  peerConnected: boolean;
  connectionMode: ConnectionMode;
  onRefresh: () => void;
  onJoinBroadcast?: (code: string) => void;
}

export const ReceiverCard: React.FC<ReceiverCardProps> = ({
  roomCode,
  peerConnected,
  connectionMode,
  onRefresh,
  onJoinBroadcast,
}) => {
  const [receiveMode, setReceiveMode] = useState<'host' | 'broadcast'>('host');
  const [broadcastInputCode, setBroadcastInputCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const handleCopy = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBroadcastCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = normalizeRoomCode(e.target.value);
    setBroadcastInputCode(formatted);
  };

  const handleJoinBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (broadcastInputCode.replace(/\D/g, '').length >= 6 && onJoinBroadcast) {
      onJoinBroadcast(broadcastInputCode);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-5">
      {/* Scope Selector: Host Room Code vs Join Broadcast */}
      {!peerConnected && onJoinBroadcast && (
        <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-800/80 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setReceiveMode('host')}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              receiveMode === 'host'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            My Room Code (1:1)
          </button>
          <button
            type="button"
            onClick={() => setReceiveMode('broadcast')}
            className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              receiveMode === 'broadcast'
                ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Join Broadcast</span>
          </button>
        </div>
      )}

      {receiveMode === 'host' ? (
        <>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Receiver Room Code
          </div>

          <div className="my-6">
            {roomCode ? (
              <div className="flex items-center justify-center gap-3">
                <span className="font-mono text-4xl sm:text-5xl font-bold tracking-widest text-zinc-900 dark:text-white select-all">
                  {roomCode}
                </span>
                <div className="flex items-center gap-1.5">
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

                  <button
                    type="button"
                    onClick={() => setShowQr(true)}
                    title="Show QR Code"
                    className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                  >
                    <QrCode className="w-5 h-5" />
                  </button>
                </div>
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
                <span>
                  Sender Connected • {connectionMode === 'p2p-webrtc' ? 'Direct P2P' : 'Relay'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                <Radio className="w-4 h-4 animate-pulse text-zinc-400" />
                <span>Share code or scan QR. Waiting for connection...</span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-center">
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Generate new code</span>
            </button>
          </div>
        </>
      ) : peerConnected ? (
        <div className="py-6 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-medium text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            <span>Connected to Broadcast Stream • Awaiting Host</span>
          </div>
          <p className="text-xs text-zinc-400">
            Session: <span className="font-mono font-semibold">{broadcastInputCode}</span>
          </p>
        </div>
      ) : (
        /* Join Broadcast Form */
        <form onSubmit={handleJoinBroadcastSubmit} className="text-center py-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
            Enter Broadcast Session Code
          </div>

          <div className="my-6 max-w-xs mx-auto">
            <input
              type="text"
              inputMode="numeric"
              placeholder="000-000"
              maxLength={7}
              value={broadcastInputCode}
              onChange={handleBroadcastCodeChange}
              className="w-full text-center font-mono text-3xl sm:text-4xl font-bold tracking-widest py-3 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
            />
          </div>

          <button
            type="submit"
            disabled={broadcastInputCode.replace(/\D/g, '').length < 6}
            className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-medium text-sm text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <span>Connect to Broadcast</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      <QRCodeModal
        roomCode={roomCode}
        isOpen={showQr}
        onClose={() => setShowQr(false)}
      />
    </div>
  );
};
