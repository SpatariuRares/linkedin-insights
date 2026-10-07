// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { draftPrompt, parseDraftOutput, systemPrompt } from './compose.ts';
import { runDraft } from './run.ts';
import type { Profile } from '../llm/types.ts';

const VOICE = {
  about: 'Product manager, 8 anni nel fintech.',
  audience: 'Altri dev e recruiter.',
  styleRules: 'Niente emoji.',
  language: 'italiano',
  examples: ['Esempio di post mio', '  '],
};

const ARTICLES = [
  {
    articleId: 1,
    title: 'React Compiler di "default"',
    url: 'https://blog.example.com/rc',
    source: 'Blog',
    text: 'Testo completo dell’articolo.',
    fullText: true,
  },
  {
    articleId: 2,
    title: 'Notizia a pagamento',
    url: 'https://news.example.com/p',
    source: 'News',
    text: 'Solo il riassunto.',
    fullText: false,
  },
];

const VALID = {
  variants: [
    {
      angle: 'personale',
      text: 'Quando ho visto il React Compiler attivo di default ho pensato...',
    },
    {
      angle: 'informativo',
      text: 'Il React Compiler ora è attivo di default. Cosa cambia per chi...',
    },
  ],
  hooks: [
    'Ho cancellato 200 useMemo.',
    'React ha appena cambiato le regole.',
    'Il mio codice è più veloce senza che lo tocchi.',
  ],
};

describe('draft prompt', () => {
  it('carries voice, non-empty examples, every source with its text status and the thought', () => {
    const prompt = draftPrompt({
      voice: VOICE,
      articles: ARTICLES,
      thought: 'Secondo me è sopravvalutato',
    });
    expect(prompt).toContain('Chi è: Product manager, 8 anni nel fintech.');
    expect(prompt).toContain('--- esempio 1 ---\nEsempio di post mio');
    expect(prompt).not.toContain('esempio 2');
    expect(prompt).toContain(`titolo="React Compiler di 'default'"`);
    expect(prompt).toContain('url="https://blog.example.com/rc" testo="completo"');
    expect(prompt).toContain('url="https://news.example.com/p" testo="solo riassunto"');
    expect(prompt).toContain('<pensiero>\nSecondo me è sopravvalutato\n</pensiero>');
  });

  it('asks for the configured language and forbids invented facts', () => {
    const system = systemPrompt({ ...VOICE, language: 'inglese' });
    expect(system).toContain('Scrivi post in inglese');
    expect(system).toContain('Usa SOLO fatti');
  });
});

describe('parseDraftOutput', () => {
  it('accepts JSON wrapped in prose or code fences', () => {
    const raw = 'Ecco la bozza:\n```json\n' + JSON.stringify(VALID) + '\n```';
    expect(parseDraftOutput(raw)).toEqual(VALID);
  });

  it('rejects the wrong number of variants or hooks with a readable reason', () => {
    expect(() =>
      parseDraftOutput(JSON.stringify({ ...VALID, hooks: ['solo uno, lungo'] })),
    ).toThrow(/hooks/);
    expect(() => parseDraftOutput('nessun json qui')).toThrow(/oggetto JSON/);
  });
});

describe('runDraft', () => {
  const profile = {
    id: 1,
    name: 'p',
    kind: 'openai-compatible',
    baseUrl: 'x',
    model: 'm',
    apiKeyEnv: null,
    timeoutMs: 1000,
    isDefault: true,
  } as Profile;
  const ok = (text: string) => ({
    text,
    model: 'm',
    usage: { inputTokens: 100, outputTokens: 50 },
  });

  it('retries once on a malformed answer, telling the model what was wrong, and sums usage', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(ok('non è json'))
      .mockResolvedValueOnce(ok(JSON.stringify(VALID)));
    const run = await runDraft(generate, profile, { system: 's', prompt: 'p' });
    expect(run.output).toEqual(VALID);
    expect(run.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    expect(generate.mock.calls[1][1].prompt).toMatch(/non era valida/);
  });

  it('gives up after the second malformed answer', async () => {
    const generate = vi.fn().mockResolvedValue(ok('ancora niente'));
    await expect(runDraft(generate, profile, { system: 's', prompt: 'p' })).rejects.toThrow(
      /secondo tentativo/,
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
