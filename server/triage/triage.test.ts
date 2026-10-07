// @vitest-environment node
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../db.ts';
import { addFeed, insertArticles, listArticles } from '../store/feeds.ts';
import { setVoice } from '../store/voice.ts';
import { parseTriage, triageRequest } from './rizzo.ts';
import { TriageRunner } from './runner.ts';

function answer(over: Record<string, unknown>) {
  return {
    model: { gguf_source: 'rizzoaiacademy/rizzo-flow' },
    answers: {
      pillar: {
        status: 'ok',
        type: 'choice',
        choice: 'p1',
        probabilities: { p1: 0.7, 'nessun-tema': 0.2 },
      },
      relevance: { status: 'ok', type: 'score', score: 3.2 },
      post_worthy: {
        status: 'ok',
        type: 'boolean',
        value: true,
        probability_true_given_available: 0.81,
      },
      ...over,
    },
  };
}

describe('triage request and response', () => {
  it('asks the three questions over title, snippet, profile and pillars', () => {
    const req = triageRequest({
      profile: 'Dev frontend',
      pillars: [{ id: 'p1', name: 'Competenze' }],
      article: { title: 'React 20', snippet: 'Novità', source: 'Blog' },
    });
    expect(req.state).toContain("Profilo dell'autore: Dev frontend");
    expect(req.state).toContain('Temi su cui scrive: Competenze');
    expect(req.state).toContain('Articolo da Blog: React 20');
    expect(req.questions.pillar.options.map((o) => o.id)).toEqual(['p1', 'nessun-tema']);
    expect(req.questions.relevance.levels).toHaveLength(5);
    expect(req.questions.post_worthy.type).toBe('boolean');
  });

  it('maps answers, "none of these" and abstentions', () => {
    expect(parseTriage(answer({}))).toEqual({
      pillarId: 'p1',
      pillarProb: 0.7,
      relevance: 3.2,
      postWorthy: true,
      postWorthyProb: 0.81,
      model: 'rizzoaiacademy/rizzo-flow',
    });
    const none = parseTriage(
      answer({
        pillar: { status: 'ok', choice: 'nessun-tema', probabilities: { 'nessun-tema': 0.6 } },
        relevance: { status: 'insufficient_evidence', score: null },
        post_worthy: { status: 'insufficient_evidence', value: null },
      }),
    );
    expect(none).toMatchObject({
      pillarId: null,
      pillarProb: 0.6,
      relevance: null,
      postWorthy: null,
      postWorthyProb: null,
    });
  });
});

describe('TriageRunner', () => {
  let server: http.Server | null = null;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  function fakeRizzo(handler: (body: { state: string }) => unknown) {
    const requests: { state: string }[] = [];
    server = http.createServer((req, res) => {
      if (req.url === '/v1/models') {
        res.end(JSON.stringify({ models: [] }));
        return;
      }
      let body = '';
      req
        .on('data', (d) => (body += d))
        .on('end', () => {
          const parsed = JSON.parse(body);
          requests.push(parsed);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(handler(parsed)));
        });
    });
    return new Promise<{ url: string; requests: typeof requests }>((resolve) =>
      server!.listen(0, '127.0.0.1', () =>
        resolve({ url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}`, requests }),
      ),
    );
  }

  function seed() {
    const db = openDb(':memory:');
    const feed = addFeed(db, { url: 'https://b.example/feed', title: 'Blog' }, new Date());
    const item = (url: string, title: string) => ({
      guid: null,
      url,
      title,
      snippet: '',
      author: null,
      publishedAt: '2026-10-06T10:00:00.000Z',
    });
    insertArticles(
      db,
      feed,
      [item('https://b.example/1', 'React 20'), item('https://b.example/2', 'Calcio')],
      new Date(),
    );
    db.prepare(`UPDATE articles SET state = 'discarded' WHERE title = 'Calcio'`).run();
    return db;
  }

  it('leaves articles unscored while Rizzo Flow is off, and scores the backlog once it is on', async () => {
    const db = seed();
    const off = new TriageRunner({
      db,
      fetcher: fetch,
      now: () => new Date(),
      baseUrl: 'http://127.0.0.1:1',
    });
    expect(await off.runNow()).toBe(0);
    expect(off.status()).toMatchObject({ online: false, pending: 1 });
    expect(listArticles(db)[0].score).toBeNull();

    const rizzo = await fakeRizzo(() => answer({}));
    setVoice(db, {
      about: 'Dev frontend',
      audience: '',
      styleRules: '',
      language: 'italiano',
      examples: [],
    });
    const on = new TriageRunner({ db, fetcher: fetch, now: () => new Date(), baseUrl: rizzo.url });
    expect(await on.runNow()).toBe(1); // the discarded article is skipped
    expect(rizzo.requests[0].state).toContain('Dev frontend');
    expect(on.status()).toMatchObject({ online: true, pending: 0 });
    expect(listArticles(db, { state: 'inbox' })[0].score).toEqual({
      pillarId: 'p1',
      pillarProb: 0.7,
      relevance: 3.2,
      postWorthy: true,
      postWorthyProb: 0.81,
    });
  });
});

describe('listArticles score filters', () => {
  function scored() {
    const db = openDb(':memory:');
    const feed = addFeed(db, { url: 'https://b.example/feed', title: 'Blog' }, new Date());
    const item = (n: number) => ({
      guid: null,
      url: `https://b.example/${n}`,
      title: `A${n}`,
      snippet: '',
      author: null,
      publishedAt: `2026-10-0${n}T10:00:00.000Z`,
    });
    insertArticles(db, feed, [1, 2, 3, 4].map(item), new Date());
    const ins = db.prepare(
      `INSERT INTO article_scores (article_id, pillar_id, relevance, post_worthy, raw, scored_at)
       VALUES ((SELECT id FROM articles WHERE title = ?), ?, ?, ?, '{}', 'now')`,
    );
    ins.run('A1', 'p1', 3.5, 1);
    ins.run('A2', 'p2', 1.0, 0);
    ins.run('A3', 'p1', 2.0, 0);
    // A4 is not scored yet
    return db;
  }
  const titles = (a: { title: string }[]) => a.map((x) => x.title);

  it('sorts by relevance with unscored articles last', () => {
    expect(titles(listArticles(scored(), { sort: 'relevance' }))).toEqual(['A1', 'A3', 'A2', 'A4']);
  });

  it('combines threshold, pillar and post-worthy filters, never hiding unscored articles', () => {
    const db = scored();
    expect(titles(listArticles(db, { minRelevance: 2 }))).toEqual(['A4', 'A3', 'A1']);
    expect(titles(listArticles(db, { minRelevance: 2, pillarId: 'p1' }))).toEqual([
      'A4',
      'A3',
      'A1',
    ]);
    expect(titles(listArticles(db, { pillarId: 'p1', postWorthy: true }))).toEqual(['A4', 'A1']);
  });
});
