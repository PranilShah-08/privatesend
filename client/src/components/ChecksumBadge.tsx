import React, { useState } from 'react';
import { CheckCircle2, Download, ShieldCheck, ShieldAlert, Copy, Check } from 'lucide-react';
import type { IntegrityReport } from '../../../shared/types.js';

interface ChecksumBadgeProps {
  report: IntegrityReport;
  downloadUrl?: string | null;
}

export const ChecksumBadge: React.FC<ChecksumBadgeProps> = ({ report, downloadUrl }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(report.receiverSha256);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!report.isMatch) {
    return (
      <div className="bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 shadow-sm mt-4 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 mb-3">
          <ShieldAlert className="w-5 h-5" />
        </div>

        <h3 className="text-base font-semibold text-red-950 dark:text-red-200">
          Cryptographic Integrity Mismatch
        </h3>

        <p className="text-xs text-red-800/80 dark:text-red-400/80 mt-1 mb-4">
          The received file checksum does not match the sender's hash. The transfer is not lossless.
        </p>

        <div className="bg-white dark:bg-zinc-900 border border-red-200/60 dark:border-red-900/40 rounded-xl p-3 text-left space-y-2">
          <div>
            <span className="text-[10px] uppercase font-semibold text-zinc-400">Expected (Sender)</span>
            <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300 break-all select-all">
              {report.senderSha256}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-red-500">Calculated (Receiver)</span>
            <p className="font-mono text-[11px] text-red-600 dark:text-red-400 break-all select-all">
              {report.receiverSha256}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-6 shadow-sm mt-4 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 mb-3">
        <CheckCircle2 className="w-5 h-5" />
      </div>

      <h3 className="text-base font-semibold text-emerald-950 dark:text-emerald-200">
        Lossless Transfer Complete
      </h3>

      <p className="text-xs text-emerald-800/80 dark:text-emerald-400/80 mt-1 mb-4">
        100% Bit-for-Bit Identity Match. Zero compression or data alteration.
      </p>

      {/* SHA-256 Proof Box */}
      <div className="bg-white dark:bg-zinc-900 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl p-3 text-left">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
          <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            Verified SHA-256 Checksum
          </span>
          <button
            type="button"
            onClick={handleCopyHash}
            className="flex items-center gap-1 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300 break-all select-all">
          {report.receiverSha256}
        </p>
      </div>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download={report.fileName}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-medium text-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>Save {report.fileName}</span>
        </a>
      )}
    </div>
  );
};
