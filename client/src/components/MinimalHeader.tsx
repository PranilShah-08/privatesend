import React from 'react';
import { ShieldCheck, Zap } from 'lucide-react';

export const MinimalHeader: React.FC = () => {
  return (
    <header className="flex flex-col items-center justify-center text-center pt-8 pb-4 px-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-zinc-900 font-bold">
          <Zap className="w-4 h-4 fill-current" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          LosslessDrop
        </h1>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mb-3">
        Direct peer-to-peer file transfer with bit-for-bit quality preservation.
      </p>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        <span>E2E Encrypted</span>
        <span className="text-zinc-400 dark:text-zinc-600">•</span>
        <span>Zero Server Storage</span>
      </div>
    </header>
  );
};
