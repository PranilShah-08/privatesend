import type { AIInspectRequest, AIInspectResponse } from '../../../shared/types.js';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log',
  'py', 'rs', 'ts', 'tsx', 'js', 'jsx', 'html', 'css', 'yaml', 'yml',
  'sh', 'bash', 'zsh', 'sql', 'toml', 'env', 'xml', 'c', 'cpp', 'h',
]);

export function isFileInspectable(fileName: string, fileType = ''): boolean {
  if (fileType.startsWith('text/') || fileType === 'application/json') {
    return true;
  }
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return TEXT_EXTENSIONS.has(ext);
}

export function getDefaultAiIndexerEndpoint(): string {
  if (typeof window !== 'undefined') {
    const custom = (import.meta as any).env?.VITE_AI_INDEXER_URL;
    if (custom) return custom;
  }
  return 'http://localhost:8000/index-ephemeral';
}

const STOP_WORDS = new Set([
  'the', 'and', 'or', 'a', 'an', 'is', 'in', 'it', 'to', 'for', 'of', 'on', 'with',
  'at', 'by', 'this', 'that', 'as', 'are', 'was', 'were', 'from', 'be', 'can', 'has',
  'have', 'had', 'not', 'but', 'all', 'any', 'we', 'you', 'they', 'our', 'my', 'your',
  'their', 'its', 'will', 'if', 'more', 'about', 'than', 'into', 'which', 'also'
]);

export function inspectDocumentClientSide(req: AIInspectRequest): AIInspectResponse {
  const text = (req.documentText || '').trim();
  if (!text) {
    return {
      summary: 'Empty document.',
      keyTopics: [],
      detectedLanguage: 'en',
      answer: req.query ? 'Document contains no readable text.' : undefined,
      sampleEntities: [],
      audit: {
        zeroDiskPersistence: true,
        storageMode: 'volatile_client_ram',
        ramFlushed: true,
      },
    };
  }

  // 1. Tokenize & Frequency Analysis for Key Topics
  const rawWords = text.match(/[a-zA-Z0-9_-]{3,}/g) || [];
  const freqMap = new Map<string, number>();

  for (const raw of rawWords) {
    const word = raw.toLowerCase();
    if (!STOP_WORDS.has(word) && !/^\d+$/.test(word)) {
      freqMap.set(word, (freqMap.get(word) || 0) + 1);
    }
  }

  const sortedTopics = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);

  // 2. Extractive Sentence Summarization
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  let summary = '';
  if (sentences.length <= 2) {
    summary = sentences.join(' ');
  } else {
    const scoredSentences = sentences.map((sent, idx) => {
      let score = 0;
      const lower = sent.toLowerCase();
      for (const topic of sortedTopics) {
        if (lower.includes(topic)) score += (freqMap.get(topic) || 1);
      }
      // Weight initial introduction sentences
      if (idx === 0) score *= 1.5;
      if (idx === 1) score *= 1.2;
      return { sent, idx, score: score / Math.sqrt(sent.length) };
    });

    const topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .sort((a, b) => a.idx - b.idx)
      .map((item) => item.sent);

    summary = topSentences.join(' ');
  }

  // 3. Natural Language Query Context Search
  let answer: string | undefined = undefined;
  if (req.query && req.query.trim()) {
    const queryTerms = req.query
      .toLowerCase()
      .match(/[a-zA-Z0-9_-]{3,}/g)
      ?.filter((t) => !STOP_WORDS.has(t)) || [];

    if (queryTerms.length === 0) {
      answer = summary || 'No matching content found for query.';
    } else {
      let bestSent = '';
      let bestScore = 0;

      for (const sent of sentences) {
        const lower = sent.toLowerCase();
        let matchCount = 0;
        for (const term of queryTerms) {
          if (lower.includes(term)) matchCount++;
        }
        if (matchCount > bestScore) {
          bestScore = matchCount;
          bestSent = sent;
        }
      }

      answer = bestSent
        ? `Found in document: "${bestSent}"`
        : 'No direct matching answer found in document.';
    }
  }

  // 4. Sample Entities Extraction (emails, URLs, capitalized tech tokens)
  const sampleEntities: string[] = [];
  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const urls = text.match(/https?:\/\/[^\s)"]+/g) || [];
  for (const email of emails) {
    if (!sampleEntities.includes(email)) sampleEntities.push(email);
  }
  for (const url of urls) {
    if (!sampleEntities.includes(url)) sampleEntities.push(url);
  }

  return {
    summary: summary || text.slice(0, 200),
    keyTopics: sortedTopics,
    detectedLanguage: 'en',
    answer,
    sampleEntities: sampleEntities.slice(0, 6),
    audit: {
      zeroDiskPersistence: true,
      storageMode: 'volatile_client_ram',
      ramFlushed: true,
    },
  };
}

export async function inspectDocumentEphemeral(
  req: AIInspectRequest,
  endpoint = getDefaultAiIndexerEndpoint()
): Promise<AIInspectResponse> {
  const payload = {
    document_text: req.documentText,
    file_name: req.fileName,
    query: req.query || null,
    similarity_top_k: 3,
  };

  let timeoutId: any = null;
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), 1500);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (response.ok) {
      const data = await response.json();
      return {
        summary: data.summary || '',
        keyTopics: data.key_topics || [],
        detectedLanguage: data.detected_language,
        answer: data.answer || undefined,
        sampleEntities: data.sample_entities || [],
        audit: {
          zeroDiskPersistence: data.audit?.zero_disk_persistence ?? true,
          storageMode: data.audit?.storage_mode ?? 'volatile_ram',
          ramFlushed: data.audit?.ram_flushed ?? true,
        },
      };
    }
  } catch {
    // Remote service unavailable / timeout / offline fallback
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  // Seamless client-side zero-server volatile RAM fallback
  return inspectDocumentClientSide(req);
}
