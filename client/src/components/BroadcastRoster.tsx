import React from 'react';
import { Radio, Users, CheckCircle2, ShieldCheck } from 'lucide-react';

export interface BroadcastReceiverInfo {
  id: string;
  name?: string;
  verified?: boolean;
}

export interface BroadcastRosterProps {
  receiversCount: number;
  receiverIds?: string[];
  isTransferring?: boolean;
}

export const BroadcastRoster: React.FC<BroadcastRosterProps> = ({
  receiversCount,
  receiverIds = [],
  isTransferring = false,
}) => {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              1-to-Many Broadcast Session
            </h4>
            <p className="text-[11px] text-zinc-400">
              One QR / code streams simultaneously to all connected peers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-medium">
          <Users className="w-3.5 h-3.5" />
          <span>{receiversCount} {receiversCount === 1 ? 'Receiver' : 'Receivers'}</span>
        </div>
      </div>

      {receiversCount === 0 ? (
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-700/50 text-center text-xs text-zinc-400">
          Waiting for receivers to scan QR code or enter session code...
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
            Connected Peers
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {receiverIds.length > 0 ? (
              receiverIds.map((id, index) => (
                <div
                  key={id}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 truncate">
                      Receiver #{index + 1} ({id.slice(-6)})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                    {isTransferring ? (
                      <span className="text-emerald-500 font-medium">Streaming</span>
                    ) : (
                      <span className="flex items-center gap-1 text-zinc-400">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        Ready
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50 text-xs text-zinc-500">
                {receiversCount} peers connected to multicast stream
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>End-to-end encrypted multicast • Ephemeral in RAM</span>
      </div>
    </div>
  );
};
