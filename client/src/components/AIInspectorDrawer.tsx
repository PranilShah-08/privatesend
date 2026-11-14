import React, { useState, useEffect } from 'react';
import { X, Sparkles, Send, ShieldCheck, Tag, Loader2, HelpCircle } from 'lucide-react';
import { inspectDocumentEphemeral } from '../services/aiInspectorService.js';
import type { AIInspectResponse } from '../../../shared/types.js';

interface AIInspectorDrawerProps {
  fileName: string;
  blob: Blob;
  isOpen: boolean;
  onClose: () => void;
}

export const AIInspectorDrawer: React.FC<AIInspectorDrawerProps> = ({
  fileName,
  blob,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AIInspectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setData(null);
      setError(null);
      setQuery('');
      setQueryAnswer(null);
      return;
    }

    let isSubscribed = true;
    setLoading(true);
    setError(null);

    blob
      .text()
      .then((text) => {
        if (!isSubscribed) return;
        return inspectDocumentEphemeral({
          documentText: text,
          fileName,
        });
      })
      .then((res) => {
        if (isSubscribed && res) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isSubscribed) {
          setError(err.message || 'AI inspection service is offline or unavailable.');
          setLoading(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, blob, fileName]);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || queryLoading) return;

    setQueryLoading(true);
    try {
      const text = await blob.text();
      const res = await inspectDocumentEphemeral({
        documentText: text,
        fileName,
        query: query.trim(),
      });
      setQueryAnswer(res.answer || 'No direct answer found in the document.');
    } catch (err: any) {
      setQueryAnswer(`Error querying document: ${err.message}`);
    } finally {
      setQueryLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl text-left overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="overflow-hidden">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                AI Inspector: {fileName}
              </h3>
              <p className="text-[11px] text-zinc-400">
                In-Memory LlamaIndex • Zero Disk Retention
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-center text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500 mb-2" />
              <p className="text-xs">Analyzing document in volatile RAM...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-medium mb-1">AI Inspector Service Notice</p>
              <p className="text-[11px] opacity-80">{error}</p>
              <p className="text-[10px] mt-2 text-zinc-400">
                To enable local semantic Q&A, run the microservice: <code>uvicorn main:app --port 8000</code> in <code>services/ai-indexer</code>.
              </p>
            </div>
          )}

          {data && (
            <>
              {/* Privacy Audit Pill */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl text-[11px] text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>
                  Storage: <strong>{data.audit.storageMode}</strong> • Disk Persistence: <strong>0%</strong> (Purged on Close)
                </span>
              </div>

              {/* Summary */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Summary
                </span>
                <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                  {data.summary || 'Document indexed successfully.'}
                </p>
              </div>

              {/* Key Topics */}
              {data.keyTopics && data.keyTopics.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Key Topics
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {data.keyTopics.map((topic, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md text-[11px] bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Interactive Q&A */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1 mb-2">
                  <HelpCircle className="w-3 h-3" />
                  Ask a Question
                </span>

                <form onSubmit={handleAskQuestion} className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. What is the primary function of this file?"
                    className="flex-1 px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500 text-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={queryLoading || !query.trim()}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    {queryLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </form>

                {queryAnswer && (
                  <div className="mt-3 p-3 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/40 rounded-xl text-xs text-purple-950 dark:text-purple-200">
                    <p className="font-medium text-[11px] text-purple-600 dark:text-purple-400 mb-1">
                      Answer:
                    </p>
                    <p className="leading-relaxed">{queryAnswer}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
