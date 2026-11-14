import React, { useState } from 'react';
import { Folder, FileText, Download, CheckCircle2, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { formatBytes } from '../services/speedCalculator.js';
import { createInMemoryZip, formatZipFileName } from '../services/zipBundleService.js';

export interface FolderTreeFileItem {
  fileName: string;
  fileSize: number;
  relativePath?: string;
  rawBlob?: Blob;
}

export interface FolderTreeViewerProps {
  folderName: string;
  files: FolderTreeFileItem[];
  allVerified?: boolean;
}

export const FolderTreeViewer: React.FC<FolderTreeViewerProps> = ({
  folderName,
  files,
  allVerified = false,
}) => {
  const [isZipping, setIsZipping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const totalBytes = files.reduce((acc, f) => acc + f.fileSize, 0);

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      // Collect files that have rawBlob
      const zipPayload: Array<{ relativePath: string; buffer: ArrayBuffer }> = [];

      for (const item of files) {
        if (item.rawBlob) {
          const buffer = await item.rawBlob.arrayBuffer();
          zipPayload.push({
            relativePath: item.relativePath || item.fileName,
            buffer,
          });
        }
      }

      if (zipPayload.length === 0) {
        setIsZipping(false);
        return;
      }

      const zipBlob = createInMemoryZip(zipPayload);
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = formatZipFileName(folderName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 2000);
    } catch (err) {
      console.error('Failed to create in-memory ZIP', err);
    } finally {
      setIsZipping(false);
    }
  };

  const hasBlobs = files.some((f) => Boolean(f.rawBlob));

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Folder Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <Folder className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {folderName}
              </span>
              {allVerified && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Verified
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              {files.length} {files.length === 1 ? 'file' : 'files'} • {formatBytes(totalBytes)}
            </p>
          </div>
        </div>

        {hasBlobs && (
          <button
            type="button"
            disabled={isZipping}
            onClick={handleDownloadZip}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-50 transition-all shadow-sm shrink-0"
          >
            {isZipping ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Zipping...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download .zip</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Directory Hierarchy Preview */}
      <div className="border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-800/30">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-2.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span>Folder Structure</span>
          </span>
          <span className="text-[11px] font-mono text-zinc-400">{files.length} paths</span>
        </button>

        {isExpanded && (
          <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60 p-2 space-y-1">
            {files.map((file, idx) => (
              <div
                key={`${file.relativePath || file.fileName}-${idx}`}
                className="flex items-center justify-between py-1.5 px-2 text-xs font-mono text-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60"
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{file.relativePath || file.fileName}</span>
                </div>
                <span className="text-[10px] text-zinc-400 shrink-0">
                  {formatBytes(file.fileSize)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
