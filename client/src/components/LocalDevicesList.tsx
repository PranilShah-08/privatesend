import React from 'react';
import { Wifi, Laptop, Smartphone, Monitor, ArrowRight, Loader2 } from 'lucide-react';
import type { NearbyPeer } from '../../../shared/types.js';

export interface LocalDevicesListProps {
  peers: NearbyPeer[];
  onSelectPeer: (peer: NearbyPeer) => void;
  statusText?: string | null;
  isTransferring?: boolean;
}

function getDeviceIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('iphone') || lower.includes('android') || lower.includes('mobile')) {
    return <Smartphone className="w-4 h-4 text-emerald-500" />;
  }
  if (lower.includes('mac') || lower.includes('laptop')) {
    return <Laptop className="w-4 h-4 text-emerald-500" />;
  }
  return <Monitor className="w-4 h-4 text-emerald-500" />;
}

export const LocalDevicesList: React.FC<LocalDevicesListProps> = ({
  peers,
  onSelectPeer,
  statusText,
  isTransferring = false,
}) => {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <Wifi className="w-4 h-4 text-emerald-500" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            Nearby Devices on Local Wi-Fi
          </span>
        </div>
        <span className="text-[11px] font-mono text-zinc-400">
          {peers.length} {peers.length === 1 ? 'peer' : 'peers'}
        </span>
      </div>

      {statusText && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 text-xs text-zinc-600 dark:text-zinc-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400 shrink-0" />
          <span className="truncate">{statusText}</span>
        </div>
      )}

      {peers.length === 0 ? (
        <div className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          <p>Scanning same Wi-Fi subnet...</p>
          <p className="text-[11px] mt-1 text-zinc-400/80">
            Open PrivateSend on another device on this network to share directly.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {peers.map((peer) => (
            <div
              key={peer.socketId || peer.peerId}
              className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0">
                  {getDeviceIcon(peer.deviceName)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      {peer.deviceName}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate">
                    Ready for direct consent transfer
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isTransferring}
                onClick={() => onSelectPeer(peer)}
                className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shrink-0"
              >
                <span>Send</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
