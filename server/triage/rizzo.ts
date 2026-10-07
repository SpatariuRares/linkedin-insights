import type { Fetcher } from '../http.ts';

export const RELEVANCE_LEVELS = [
  'Fuori tema: non riguarda i temi del profilo',
  'Poco pertinente: li tocca di striscio',
  'Abbastanza pertinente',
  'Molto pertinente',
  'Esattamente i temi del profilo',
];

export type TriagePillar = { id: string; name: string };

export type TriageArticle = { title: string; snippet: string; source: string };

export type TriageScore = {
  /** null = "nessuno dei pilastri" or not determinable (see pillarProb). */
  pillarId: string | null;
  pillarProb: number | null;
  /** Expected level, 0 (off-topic) … 4 (spot on); null when Rizzo abstained. */
  relevance: number | null;
  postWorthy: boolean | null;
  postWorthyProb: number | null;
  model: string | null;
};

// Option ids must match ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ (no leading underscore).
const NONE = 'nessun-tema';

type Answer = {
  status?: string;
  type?: string;
  choice?: string | null;
  score?: number | null;
  value?: boolean | null;
  probabilities?: Record<string, number>;
  probability_true_given_available?: number;
};

/** One request answers all three questions over a single shared state. */
export function triageRequest(input: {
  profile: string;
  pillars: TriagePillar[];
  article: TriageArticle;
}) {
  const { profile, pillars, article } = input;
  return {
    state: [
      `Profilo dell'autore: ${profile || '(non indicato)'}`,
      pillars.length ? `Temi su cui scrive: ${pillars.map((p) => p.name).join(', ')}` : '',
      `Articolo da ${article.source}: ${article.title}`,
      article.snippet ? `Anteprima: ${article.snippet}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    questions: {
      pillar: {
        type: 'choice',
        instructions: "A quale tema dell'autore appartiene l'articolo?",
        options: [
          ...pillars.map((p) => ({ id: p.id, description: p.name })),
          { id: NONE, description: 'Nessuno di questi temi' },
        ],
      },
      relevance: {
        type: 'score',
        instructions: "Quanto è pertinente l'articolo ai temi e al profilo dell'autore?",
        levels: RELEVANCE_LEVELS,
      },
      post_worthy: {
        type: 'boolean',
        instructions:
          "L'articolo offre uno spunto per un post LinkedIn con un'opinione o una lezione dell'autore, non solo una notizia da riportare?",
      },
    },
  };
}

export function parseTriage(body: unknown): TriageScore {
  const data = body as { answers?: Record<string, Answer>; model?: { gguf_source?: string } };
  const a = data.answers ?? {};
  const ok = (x: Answer | undefined) => x && x.status === 'ok';

  const pillar = a.pillar;
  let pillarId: string | null = null;
  let pillarProb: number | null = null;
  if (ok(pillar) && pillar!.choice) {
    pillarProb = pillar!.probabilities?.[pillar!.choice] ?? null;
    pillarId = pillar!.choice === NONE ? null : pillar!.choice;
  }

  const relevance =
    ok(a.relevance) && typeof a.relevance!.score === 'number' ? a.relevance!.score : null;

  const pw = a.post_worthy;
  const postWorthy = ok(pw) && typeof pw!.value === 'boolean' ? pw!.value : null;
  const postWorthyProb = ok(pw) ? (pw!.probability_true_given_available ?? null) : null;

  return {
    pillarId,
    pillarProb,
    relevance,
    postWorthy,
    postWorthyProb,
    model: data.model?.gguf_source ?? null,
  };
}

export async function rizzoOnline(baseUrl: string, fetcher: Fetcher): Promise<boolean> {
  try {
    const res = await fetcher(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function scoreArticle(
  baseUrl: string,
  fetcher: Fetcher,
  input: Parameters<typeof triageRequest>[0],
): Promise<{ score: TriageScore; raw: unknown }> {
  const res = await fetcher(`${baseUrl}/v1/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(triageRequest(input)),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Rizzo Flow ha risposto con errore ${res.status}.`);
  const raw = await res.json();
  return { score: parseTriage(raw), raw };
}
