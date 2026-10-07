// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Fetcher } from '../http.ts';
import { embedTexts, type EmbeddingConfig } from './embeddings.ts';

const CONFIG: EmbeddingConfig = {
  enabled: true,
  baseUrl: 'https://openrouter.ai/api/v1/',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  model: 'baai/bge-m3',
};
const ENV = { OPENROUTER_API_KEY: 'sk-test' };

function fake(response: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Response.json(response, { status });
  };
  return { fetcher, calls };
}

describe('embedTexts', () => {
  it('posts the texts to {baseUrl}/embeddings with the key, and returns unit vectors in input order', async () => {
    const { fetcher, calls } = fake({
      model: 'baai/bge-m3',
      data: [
        { index: 1, embedding: [0, 2] },
        { index: 0, embedding: [3, 4] },
      ],
    });
    const vectors = await embedTexts(CONFIG, ['primo', 'secondo'], { fetcher, env: ENV });

    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      model: 'baai/bge-m3',
      input: ['primo', 'secondo'],
    });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect([...vectors[0]].map((x) => Number(x.toFixed(3)))).toEqual([0.6, 0.8]);
    expect([...vectors[1]]).toEqual([0, 1]);
  });

  it('refuses to call the provider without the key, with a message for the user', async () => {
    const { fetcher, calls } = fake({});
    await expect(embedTexts(CONFIG, ['x'], { fetcher, env: {} })).rejects.toThrow(
      /OPENROUTER_API_KEY non è impostata/,
    );
    expect(calls).toHaveLength(0);
  });

  it('explains a rejected key and a malformed answer', async () => {
    const denied = fake({ error: { message: 'No auth credentials found' } }, 401);
    await expect(embedTexts(CONFIG, ['x'], { fetcher: denied.fetcher, env: ENV })).rejects.toThrow(
      /Chiave API rifiutata.*No auth credentials/,
    );
    const short = fake({ data: [{ index: 0, embedding: [1] }] });
    await expect(
      embedTexts(CONFIG, ['a', 'b'], { fetcher: short.fetcher, env: ENV }),
    ).rejects.toThrow(/risposta incompleta/);
  });

  it('sends nothing for an empty batch', async () => {
    const { fetcher, calls } = fake({});
    expect(await embedTexts(CONFIG, [], { fetcher, env: ENV })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
