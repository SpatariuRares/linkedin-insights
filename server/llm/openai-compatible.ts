import type { Fetcher } from '../http.ts';
import { LlmError, type GenerateInput, type GenerateResult, type Profile } from './types.ts';

type ChatResponse = {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export function apiKeyFor(profile: Profile, env: Record<string, string | undefined>): string {
  if (!profile.apiKeyEnv)
    throw new LlmError('Il profilo non indica la variabile con la chiave API.');
  const key = env[profile.apiKeyEnv]?.trim();
  if (!key) {
    throw new LlmError(
      `La variabile ${profile.apiKeyEnv} non è impostata: aggiungila al file .env e riavvia il server.`,
    );
  }
  return key;
}

function chatUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

/**
 * One request to any OpenAI-compatible Chat Completions endpoint: OpenRouter, OpenAI, Ollama,
 * LM Studio... Only the base URL, model and key change.
 */
export async function generateOpenAiCompatible(
  profile: Profile,
  input: GenerateInput,
  deps: { fetcher: Fetcher; env: Record<string, string | undefined> },
): Promise<GenerateResult> {
  if (!profile.baseUrl) throw new LlmError('Il profilo non ha un URL di base.');
  if (!profile.model) throw new LlmError('Il profilo non indica il modello.');
  // Local servers like Ollama need no key: a profile without a key variable sends none.
  const key = profile.apiKeyEnv ? apiKeyFor(profile, deps.env) : null;

  let res: Response;
  try {
    res = await deps.fetcher(chatUrl(profile.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        // OpenRouter uses these to label the app in its dashboard; other providers ignore them.
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'Crescita LinkedIn dashboard',
      },
      body: JSON.stringify({
        model: profile.model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.prompt },
        ],
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      }),
      signal: AbortSignal.timeout(profile.timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new LlmError(
        `Il modello non ha risposto entro ${Math.round(profile.timeoutMs / 1000)} s.`,
      );
    }
    throw new LlmError(`Impossibile contattare ${profile.baseUrl}: ${(err as Error).message}`);
  }

  const data = (await res.json().catch(() => ({}))) as ChatResponse;
  if (!res.ok) {
    const detail = data.error?.message ?? `errore ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new LlmError(`Chiave API rifiutata (${profile.apiKeyEnv}): ${detail}`);
    }
    throw new LlmError(`Il provider ha risposto con un errore: ${detail}`);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new LlmError('Il modello ha restituito una risposta vuota.');
  return {
    text,
    model: data.model ?? profile.model,
    usage: data.usage
      ? {
          inputTokens: data.usage.prompt_tokens ?? null,
          outputTokens: data.usage.completion_tokens ?? null,
        }
      : null,
  };
}

/** The provider's model list, when it exposes one (OpenRouter and OpenAI do, without a key). */
export async function listModels(
  baseUrl: string,
  deps: { fetcher: Fetcher; key?: string },
): Promise<string[]> {
  const res = await deps.fetcher(`${baseUrl.replace(/\/+$/, '')}/models`, {
    headers: deps.key ? { Authorization: `Bearer ${deps.key}` } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new LlmError(`Elenco modelli non disponibile (errore ${res.status}).`);
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === 'string')
    .sort();
}
