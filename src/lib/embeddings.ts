/** Mirrors the server's embedding settings and the runner's progress (GET /api/embeddings/status). */
export type EmbeddingConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKeyEnv: string | null;
  model: string;
};

export type EmbeddingStatus = EmbeddingConfig & {
  keyPresent: boolean | null;
  embedded: number;
  pending: number;
  running: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};

/** Multilingual models on OpenRouter, so Italian and English news land in the same space. */
export const EMBEDDING_MODELS: { id: string; label: string }[] = [
  { id: 'baai/bge-m3', label: 'BGE-M3 · consigliato · $0,01 / M token' },
  { id: 'qwen/qwen3-embedding-8b', label: 'Qwen3 Embedding 8B · $0,01 / M token' },
  { id: 'openai/text-embedding-3-small', label: 'OpenAI text-embedding-3-small · $0,02 / M token' },
  { id: 'voyageai/voyage-4-lite', label: 'Voyage 4 Lite · $0,02 / M token' },
  { id: 'google/gemini-embedding-2', label: 'Gemini Embedding 2 · $0,20 / M token' },
];
