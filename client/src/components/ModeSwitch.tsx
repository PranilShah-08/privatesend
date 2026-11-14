import React from 'react';
import { Download, Upload } from 'lucide-react';
import type { ParticipantRole } from '../../../shared/types.js';

interface ModeSwitchProps {
  mode: ParticipantRole;
  onChange: (mode: ParticipantRole) => void;
  disabled?: boolean;
}

export const ModeSwitch: React.FC<ModeSwitchProps> = ({ mode, onChange, disabled }) => {
  return (
    <div className="flex justify-center my-4">
      <div className="inline-flex p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('receiver')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            mode === 'receiver'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Download className="w-4 h-4" />
          <span>Receive</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('sender')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            mode === 'sender'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Upload className="w-4 h-4" />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
};
