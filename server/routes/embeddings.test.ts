// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { openDb } from '../db.ts';
import type { Fetcher } from '../http.ts';
import { EmbeddingRunner } from '../embeddings/runner.ts';
import { addFeed, insertArticles, setArticleState } from '../store/feeds.ts';
import { loadEmbeddings } from '../store/embeddings.ts';

const NOW = new Date('2026-10-08T10:00:00Z');

function setup(env: Record<string, string> = { OPENROUTER_API_KEY: 'sk-test' }) {
  const db = openDb(':memory:');
  const feed = addFeed(db, { url: 'https://news.example.com/feed', title: 'Esempio' }, NOW);
  insertArticles(
    db,
    feed,
    ['Primo', 'Secondo', 'Terzo'].map((title, i) => ({
      guid: null,
      url: `https://news.example.com/${i}`,
      title,
      snippet: `Riassunto ${i}`,
      author: null,
      publishedAt: NOW.toISOString(),
    })),
    NOW,
  );
  setArticleState(db, 3, 'discarded', NOW);

  const requests: { url: string; body: { model: string; input: string[] } }[] = [];
  const fetcher: Fetcher = async (input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ url: String(input), body });
    return Response.json({
      data: body.input.map((_: string, index: number) => ({ index, embedding: [1, index] })),
    });
  };
  const embedder = new EmbeddingRunner({ db, fetcher, env, now: () => NOW });
  const app = createApp({ db, fetcher, env, now: () => NOW, embedder });
  const json = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { db, app, json, embedder, requests };
}

describe('embeddings', () => {
  it('embeds title and summary of every article that is not discarded, once', async () => {
    const { db, embedder, requests } = setup();
    expect(await embedder.runNow()).toBe(2);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(requests[0].body).toEqual({
      model: 'baai/bge-m3',
      input: ['Secondo\nRiassunto 1', 'Primo\nRiassunto 0'],
    });
    expect([...loadEmbeddings(db, 'baai/bge-m3').keys()].sort()).toEqual([1, 2]);
    expect(await embedder.runNow()).toBe(0);
    expect(requests).toHaveLength(1);
  });

  it('reports progress and the missing key without calling the provider', async () => {
    const { app, embedder, requests } = setup({});
    await embedder.runNow();
    expect(requests).toHaveLength(0);
    const status = await (await app.request('/api/embeddings/status')).json();
    expect(status).toMatchObject({
      enabled: true,
      model: 'baai/bge-m3',
      keyPresent: false,
      embedded: 0,
      pending: 2,
    });
    expect(status.lastError).toMatch(/OPENROUTER_API_KEY non è impostata/);
  });

  it('does nothing while search by meaning is off', async () => {
    const { json, embedder, requests } = setup();
    const res = await json('PUT', '/api/embeddings/config', {
      enabled: false,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      model: 'baai/bge-m3',
    });
    expect(res.status).toBe(200);
    expect(await embedder.runNow()).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it('switching model drops the old vectors and re-indexes with the new one', async () => {
    const { db, json, embedder, requests } = setup();
    await embedder.runNow();
    await json('PUT', '/api/embeddings/config', {
      enabled: true,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      model: 'qwen/qwen3-embedding-8b',
    });
    await embedder.runNow();
    expect(loadEmbeddings(db, 'baai/bge-m3').size).toBe(0);
    expect(loadEmbeddings(db, 'qwen/qwen3-embedding-8b').size).toBe(2);
    expect(requests.at(-1)!.body.model).toBe('qwen/qwen3-embedding-8b');
  });

  it('rejects an invalid config', async () => {
    const { json } = setup();
    const res = await json('PUT', '/api/embeddings/config', {
      enabled: true,
      baseUrl: 'non un url',
      apiKeyEnv: 'sk-123',
      model: '',
    });
    expect(res.status).toBe(400);
  });
});
