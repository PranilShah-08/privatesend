import React, { useEffect, useState } from 'react';
import { X, QrCode, Copy, Check } from 'lucide-react';
import { generateRoomQrSvg, getRoomShareUrl } from '../services/qrCodeService.js';

interface QRCodeModalProps {
  roomCode: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ roomCode, isOpen, onClose }) => {
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !roomCode) return;
    const isDark = document.documentElement.classList.contains('dark');
    generateRoomQrSvg(roomCode, isDark).then(setSvgHtml);
  }, [isOpen, roomCode]);

  if (!isOpen) return null;

  const shareUrl = getRoomShareUrl(roomCode);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="inline-flex items-center justify-center w-10 h-10 mb-3 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
          <QrCode className="w-5 h-5" />
        </div>

        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
          Scan to Connect
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Scan with your phone or camera to pair instantly.
        </p>

        {/* QR Code Container */}
        <div className="flex items-center justify-center my-5 p-4 bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl">
          {svgHtml ? (
            <div
              className="w-48 h-48 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-xs text-zinc-400">
              Generating QR Code...
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 text-xs">
          <span className="font-mono text-zinc-600 dark:text-zinc-300 truncate">
            {roomCode}
          </span>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="flex items-center gap-1 font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
