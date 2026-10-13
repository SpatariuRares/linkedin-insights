// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { openDb } from '../db.ts';
import { fakeFetch } from '../test-fetch.ts';
import { addFeed, insertArticles, setArticleState } from '../store/feeds.ts';
import { saveEmbeddings, setEmbeddingConfig, getEmbeddingConfig } from '../store/embeddings.ts';

const NOW = new Date('2026-10-07T10:00:00Z');

function setup(
  titles: { title: string; snippet?: string; state?: 'saved' | 'archived' | 'discarded' }[],
) {
  const db = openDb(':memory:');
  const feed = addFeed(db, { url: 'https://news.example.com/feed', title: 'Esempio' }, NOW);
  insertArticles(
    db,
    feed,
    titles.map((t, i) => ({
      guid: null,
      url: `https://news.example.com/${i}`,
      title: t.title,
      snippet: t.snippet ?? '',
      author: null,
      publishedAt: new Date(NOW.getTime() - i * 3_600_000).toISOString(),
    })),
    NOW,
  );
  titles.forEach((t, i) => t.state && setArticleState(db, i + 1, t.state, NOW));
  const app = createApp({ db, fetcher: fakeFetch({}).fetcher, now: () => NOW });
  const get = async (path: string) => {
    const res = await app.request(path);
    return { status: res.status, body: await res.json() };
  };
  const titlesOf = (list: { title: string }[]) => list.map((a) => a.title);
  return { db, get, titlesOf };
}

describe('article search', () => {
  it('finds articles by title or summary, by word prefix and without accents', async () => {
    const { get, titlesOf } = setup([
      { title: 'OpenAI lancia un nuovo modello' },
      { title: 'Taiwan e i chips: la nuova crisi' },
      { title: 'Il mercato del lavoro', snippet: 'Perché i chip mancano ancora' },
    ]);
    expect(titlesOf((await get('/api/articles?q=openai')).body)).toEqual([
      'OpenAI lancia un nuovo modello',
    ]);
    expect(titlesOf((await get('/api/articles?q=chip')).body)).toEqual([
      'Taiwan e i chips: la nuova crisi',
      'Il mercato del lavoro',
    ]);
    expect(titlesOf((await get('/api/articles?q=perche%20chip')).body)).toEqual([
      'Il mercato del lavoro',
    ]);
  });

  it('combines the search with the other filters and ignores a query of only stopwords', async () => {
    const { get, titlesOf } = setup([
      { title: 'Chip e geopolitica' },
      { title: 'Chip in Europa', state: 'saved' },
    ]);
    expect(titlesOf((await get('/api/articles?state=saved&q=chip')).body)).toEqual([
      'Chip in Europa',
    ]);
    expect((await get('/api/articles?q=il%20la%20the')).body).toHaveLength(2);
  });

  it('keeps the index in step when an article is deleted with its feed', async () => {
    const { db, get } = setup([{ title: 'Chip e geopolitica' }]);
    db.prepare('DELETE FROM articles').run();
    expect((await get('/api/articles?q=chip')).body).toEqual([]);
  });
});

describe('related articles', () => {
  it('lists other articles on the same story, archived included, best match first', async () => {
    const { get, titlesOf } = setup([
      { title: 'Nvidia chip export ban to China tightens' },
      { title: 'China responds to the Nvidia chip ban', state: 'archived' },
      { title: 'Nvidia earnings beat expectations' },
      { title: 'Export ban on Nvidia chips, China furious', state: 'discarded' },
      { title: 'Chip makers worry about China' },
    ]);
    const { status, body } = await get('/api/articles/1/related');
    expect(status).toBe(200);
    expect(titlesOf(body)).toEqual([
      'China responds to the Nvidia chip ban',
      'Chip makers worry about China',
    ]);
  });

  it('answers 404 for an unknown article', async () => {
    const { get } = setup([]);
    expect((await get('/api/articles/99/related')).status).toBe(404);
  });
});

describe('topic graph', () => {
  const STORIES = [
    { title: 'Taiwan chip exports to China face new limits' },
    { title: 'China answers Taiwan chip export limits', state: 'saved' as const },
    { title: 'Taiwanese chipmakers weigh China exports', state: 'archived' as const },
    { title: 'Taiwan chip limits worry China', state: 'discarded' as const },
    { title: 'A recipe for sourdough bread' },
  ];

  it('links recent inbox and saved news into topics, with the article attached', async () => {
    const { get } = setup(STORIES);
    const { status, body } = await get('/api/articles/graph');
    expect(status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.isolated).toBe(1);
    expect(body.nodes.map((n: { id: number }) => n.id).sort()).toEqual([1, 2]);
    expect(body.nodes[0].article).toMatchObject({ source: 'Esempio' });
    expect(body.topics).toHaveLength(1);
    // three of the words both headlines share
    expect(body.topics[0].terms).toHaveLength(3);
    expect(['china', 'chip', 'export', 'limits', 'taiwan']).toEqual(
      expect.arrayContaining(body.topics[0].terms),
    );
  });

  it('adds the archive on request and never shows discarded news', async () => {
    const { get } = setup(STORIES);
    const { body } = await get('/api/articles/graph?archived=true');
    const ids = body.nodes.map((n: { id: number }) => n.id).sort();
    expect(ids).toEqual([1, 2, 3]);
  });

  it('only takes news from the chosen period', async () => {
    const { get } = setup(STORIES);
    // the fixtures are published one hour apart, all within the last day
    expect((await get('/api/articles/graph?days=1')).body.total).toBe(3);
    expect((await get('/api/articles/graph?days=0')).status).toBe(400);
  });

  it('keeps only the chosen feeds', async () => {
    const { db, get } = setup(STORIES);
    const other = addFeed(db, { url: 'https://altro.example.com/feed', title: 'Altro' }, NOW);
    insertArticles(
      db,
      other,
      [
        {
          guid: null,
          url: 'https://altro.example.com/1',
          title: 'Taiwan chip export limits anger China',
          snippet: '',
          author: null,
          publishedAt: NOW.toISOString(),
        },
      ],
      NOW,
    );
    expect((await get('/api/articles/graph')).body.total).toBe(4);
    expect((await get(`/api/articles/graph?feedIds=${other.id}`)).body.total).toBe(1);
    expect((await get('/api/articles/graph?feedIds=')).body.total).toBe(0);
    expect((await get('/api/articles/graph?feedIds=1,x')).status).toBe(400);
  });
});

const unit = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return Float32Array.from(xs, (x) => x / n);
};

describe('related articles by meaning', () => {
  const STORY = [
    { title: 'Ukraine says Russia bombed apartment block' },
    { title: "L'Ucraina accusa Mosca: missili su un condominio" },
    { title: 'Kyiv residential building hit overnight', state: 'discarded' as const },
    { title: 'OpenAI lancia un nuovo modello' },
  ];

  function withVectors() {
    const ctx = setup(STORY);
    saveEmbeddings(
      ctx.db,
      'baai/bge-m3',
      [
        { id: 1, vector: unit(1, 0, 0) },
        { id: 2, vector: unit(1, 0.3, 0) },
        { id: 3, vector: unit(1, 0.1, 0) },
        { id: 4, vector: unit(0, 0, 1) },
      ],
      NOW,
    );
    return ctx;
  }

  it('finds the same story in another language, with its similarity, never discarded news', async () => {
    const { get } = withVectors();
    const { body } = await get('/api/articles/1/related');
    expect(body.map((a: { id: number }) => a.id)).toEqual([2]);
    expect(body[0].similarity).toBeGreaterThan(0.9);
  });

  it('falls back to shared words when search by meaning is off', async () => {
    const { db, get } = withVectors();
    setEmbeddingConfig(db, { ...getEmbeddingConfig(db), enabled: false });
    expect((await get('/api/articles/1/related')).body).toEqual([]);
  });

  it('links the graph by meaning when every article has a vector', async () => {
    const { get } = withVectors();
    const { body } = await get('/api/articles/graph');
    expect(body.method).toBe('semantic');
    expect(body.edges).toEqual([
      expect.objectContaining({ source: 1, target: 2, kind: 'semantic' }),
    ]);
  });
});
