import type { Fetcher } from '../http.ts';
import { LlmError } from './types.ts';

/** Where article embeddings come from; any OpenAI-compatible `/embeddings` endpoint works. */
export type EmbeddingConfig = {
  enabled: boolean;
  baseUrl: string;
  /** Name of the env var holding the key; null for local servers that need none. */
  apiKeyEnv: string | null;
  model: string;
};

type EmbeddingResponse = {
  data?: { index?: number; embedding?: number[] }[];
  error?: { message?: string };
};

function unit(values: number[]): Float32Array {
  const norm = Math.hypot(...values) || 1;
  return Float32Array.from(values, (x) => x / norm);
}

/**
 * Embeds a batch of texts in one request. Vectors come back normalised to length 1, so the cosine
 * similarity of two of them is just their dot product.
 */
export async function embedTexts(
  config: EmbeddingConfig,
  texts: string[],
  deps: { fetcher: Fetcher; env: Record<string, string | undefined>; timeoutMs?: number },
): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const key = config.apiKeyEnv ? deps.env[config.apiKeyEnv]?.trim() : null;
  if (config.apiKeyEnv && !key) {
    throw new LlmError(
      `La variabile ${config.apiKeyEnv} non è impostata: aggiungila al file .env e riavvia il server.`,
    );
  }

  let res: Response;
  try {
    res = await deps.fetcher(`${config.baseUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'Crescita LinkedIn dashboard',
      },
      body: JSON.stringify({ model: config.model, input: texts }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 60_000),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new LlmError('Il servizio di embedding non ha risposto in tempo.');
    }
    throw new LlmError(`Impossibile contattare ${config.baseUrl}: ${(err as Error).message}`);
  }

  const data = (await res.json().catch(() => ({}))) as EmbeddingResponse;
  if (!res.ok) {
    const detail = data.error?.message ?? `errore ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new LlmError(`Chiave API rifiutata (${config.apiKeyEnv}): ${detail}`);
    }
    throw new LlmError(`Il servizio di embedding ha risposto con un errore: ${detail}`);
  }
  const rows = (data.data ?? [])
    .filter((d) => Array.isArray(d.embedding) && d.embedding.length > 0)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (rows.length !== texts.length) {
    throw new LlmError(
      `Il servizio di embedding ha dato una risposta incompleta (${rows.length} vettori per ${texts.length} testi).`,
    );
  }
  return rows.map((d) => unit(d.embedding!));
}
