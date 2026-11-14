import React, { useState } from 'react';
import { ShieldAlert, Trash2, Check } from 'lucide-react';

interface PanicButtonProps {
  onWipe: () => void;
}

export const PanicButton: React.FC<PanicButtonProps> = ({ onWipe }) => {
  const [confirming, setConfirming] = useState(false);
  const [wiped, setWiped] = useState(false);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }

    onWipe();
    setConfirming(false);
    setWiped(true);
    setTimeout(() => setWiped(false), 3000);
  };

  if (wiped) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-all">
        <Check className="w-3.5 h-3.5" />
        <span>Memory Zeroed</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={confirming ? 'Click again to confirm immediate RAM wipe' : 'Emergency Session Wipe'}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
        confirming
          ? 'bg-rose-600 text-white animate-pulse shadow-sm'
          : 'bg-zinc-100 hover:bg-rose-50 text-zinc-500 hover:text-rose-600 dark:bg-zinc-800/80 dark:hover:bg-rose-950/40 dark:text-zinc-400 dark:hover:text-rose-400 border border-zinc-200/80 dark:border-zinc-700/80'
      }`}
    >
      {confirming ? (
        <>
          <Trash2 className="w-3.5 h-3.5" />
          <span>Confirm Wipe?</span>
        </>
      ) : (
        <>
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Wipe Session</span>
        </>
      )}
    </button>
  );
};
