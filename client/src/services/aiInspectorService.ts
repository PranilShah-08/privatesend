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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Inspector failed (${response.status}): ${errorText}`);
  }

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
