// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { openDb } from '../db.ts';
import { fakeFetch, fixture } from '../test-fetch.ts';

function setup(routes: Parameters<typeof fakeFetch>[0]) {
  const db = openDb(':memory:');
  const { fetcher, calls } = fakeFetch(routes);
  const app = createApp({ db, fetcher, now: () => new Date('2026-10-07T10:00:00Z') });
  const json = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { db, app, json, calls };
}

const RSS = 'https://blog.example.com/feed.xml';

describe('feeds API', () => {
  it('discovers feeds from a site URL and flags those already added', async () => {
    const { json } = setup({
      'https://example.com/blog': { body: fixture('site.html') },
      'https://example.com/feed.xml': { body: fixture('rss.xml'), type: 'application/rss+xml' },
    });
    await json('POST', '/api/feeds', { url: 'https://example.com/feed.xml', title: 'Articoli' });
    const res = await json('POST', '/api/feeds/discover', { url: 'https://example.com/blog' });
    expect(await res.json()).toEqual({
      feeds: [
        { url: 'https://example.com/feed.xml', title: 'Articoli', alreadyAdded: true },
        { url: 'https://example.com/comments.atom', title: 'Commenti', alreadyAdded: false },
      ],
    });
  });

  it('adds a feed, fetches it right away and lists its articles newest first', async () => {
    const { json, app } = setup({
      [RSS]: { body: fixture('rss.xml'), type: 'application/rss+xml' },
    });
    const res = await json('POST', '/api/feeds', { url: RSS, title: 'Blog' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.added).toBe(2);
    expect(body.feed).toMatchObject({
      title: 'Blog',
      enabled: true,
      errorCount: 0,
      articleCount: 2,
    });

    const articles = await (await app.request('/api/articles?state=inbox')).json();
    expect(articles.map((a: { title: string }) => a.title)).toEqual([
      // the undated item gets the fetch time, which is newer
      'Tesla’s notizia & senza data',
      'React Compiler di default',
    ]);
    expect(articles[1]).toMatchObject({ source: 'Blog', state: 'inbox' });
  });

  it('refuses a duplicate feed', async () => {
    const { json } = setup({ [RSS]: { body: fixture('rss.xml'), type: 'text/xml' } });
    await json('POST', '/api/feeds', { url: RSS, title: 'Blog' });
    expect((await json('POST', '/api/feeds', { url: RSS, title: 'Blog' })).status).toBe(409);
  });

  it('does not duplicate articles on refresh', async () => {
    const { json, app } = setup({ [RSS]: { body: fixture('rss.xml'), type: 'text/xml' } });
    const { feed } = await (await json('POST', '/api/feeds', { url: RSS, title: 'Blog' })).json();
    const again = await (await json('POST', `/api/feeds/${feed.id}/refresh`)).json();
    expect(again.added).toBe(0);
    expect(await (await app.request('/api/articles')).json()).toHaveLength(2);
  });

  it('records a fetch error on the feed instead of failing', async () => {
    const { json } = setup({ [RSS]: { status: 500, body: 'boom' } });
    const body = await (await json('POST', '/api/feeds', { url: RSS, title: 'Blog' })).json();
    expect(body.error).toMatch(/500/);
    expect(body.feed).toMatchObject({ errorCount: 1, lastError: expect.stringMatching(/500/) });
  });

  it('skips paused feeds when refreshing all', async () => {
    const { json, calls } = setup({ [RSS]: { body: fixture('rss.xml'), type: 'text/xml' } });
    const { feed } = await (await json('POST', '/api/feeds', { url: RSS, title: 'Blog' })).json();
    await json('PATCH', `/api/feeds/${feed.id}`, { enabled: false, title: 'Rinominato' });
    calls.length = 0;
    const res = await (await json('POST', '/api/feeds/refresh')).json();
    expect(res).toEqual({ refreshed: 0, added: 0, failed: 0 });
    expect(calls).toHaveLength(0);
  });

  it('deletes a feed with its unsaved articles', async () => {
    const { json, app, db } = setup({ [RSS]: { body: fixture('rss.xml'), type: 'text/xml' } });
    const { feed } = await (await json('POST', '/api/feeds', { url: RSS, title: 'Blog' })).json();
    db.prepare(
      `UPDATE articles SET state = 'saved' WHERE title = 'React Compiler di default'`,
    ).run();
    expect((await json('DELETE', `/api/feeds/${feed.id}`)).status).toBe(204);
    expect(await (await app.request('/api/feeds')).json()).toEqual([]);
    const left = await (await app.request('/api/articles')).json();
    expect(left.map((a: { title: string }) => a.title)).toEqual(['React Compiler di default']);
  });
});

describe('inbox states', () => {
  const OTHER = 'https://mirror.example.net/feed.xml';
  const mirrored = fixture('rss.xml').replace(
    'https://blog.example.com/react-compiler/?utm_source=rss',
    'https://www.blog.example.com/react-compiler/?utm_medium=feed#comments',
  );

  it('moves articles between inbox, saved and discarded and counts them', async () => {
    const { json, app } = setup({ [RSS]: { body: fixture('rss.xml'), type: 'text/xml' } });
    await json('POST', '/api/feeds', { url: RSS, title: 'Blog' });
    const [first, second] = await (await app.request('/api/articles?state=inbox')).json();

    const saved = await (
      await json('PATCH', `/api/articles/${first.id}`, { state: 'saved' })
    ).json();
    expect(saved.state).toBe('saved');
    await json('PATCH', `/api/articles/${second.id}`, { state: 'discarded' });

    expect(await (await app.request('/api/articles/counts')).json()).toEqual({
      inbox: 0,
      saved: 1,
      discarded: 1,
      archived: 0,
    });
    const savedList = await (await app.request('/api/articles?state=saved')).json();
    expect(savedList.map((a: { id: number }) => a.id)).toEqual([first.id]);
  });

  it('rejects unknown states and unknown articles', async () => {
    const { json } = setup({});
    expect((await json('PATCH', '/api/articles/999', { state: 'saved' })).status).toBe(404);
  });

  it('never brings a discarded article back to the inbox when the feed repeats it', async () => {
    const { json, app } = setup({ [RSS]: { body: fixture('rss.xml'), type: 'text/xml' } });
    const { feed } = await (await json('POST', '/api/feeds', { url: RSS, title: 'Blog' })).json();
    const [first] = await (await app.request('/api/articles?state=inbox')).json();
    await json('PATCH', `/api/articles/${first.id}`, { state: 'discarded' });
    await json('POST', `/api/feeds/${feed.id}/refresh`);
    const inbox = await (await app.request('/api/articles?state=inbox')).json();
    expect(inbox.map((a: { id: number }) => a.id)).not.toContain(first.id);
  });

  it('shows an article published by two feeds only once', async () => {
    const { json, app } = setup({
      [RSS]: { body: fixture('rss.xml'), type: 'text/xml' },
      [OTHER]: { body: mirrored, type: 'text/xml' },
    });
    await json('POST', '/api/feeds', { url: RSS, title: 'Blog' });
    const res = await (await json('POST', '/api/feeds', { url: OTHER, title: 'Mirror' })).json();
    // only the mirror's relative link is new: it resolves to the mirror's own host
    expect(res.added).toBe(1);
    const titles = (await (await app.request('/api/articles')).json()).map(
      (a: { title: string }) => a.title,
    );
    expect(titles.filter((t: string) => t === 'React Compiler di default')).toHaveLength(1);
  });
});

describe('POST /api/feeds/opml', () => {
  it('adds new feeds, skips existing ones and reports a summary', async () => {
    const { json, app } = setup({ [RSS]: { body: fixture('rss.xml'), type: 'text/xml' } });
    await json('POST', '/api/feeds', { url: RSS, title: 'Blog' });
    const res = await json('POST', '/api/feeds/opml', { opml: fixture('feeds.opml') });
    expect(await res.json()).toEqual({ added: 2, existing: 1, invalid: 1 });
    const titles = (await (await app.request('/api/feeds')).json()).map(
      (f: { title: string }) => f.title,
    );
    expect(titles).toEqual(['AI Weekly (Atom)', 'Blog', 'senzanome.example.net']);
  });

  it('answers 400 for a file that is not OPML', async () => {
    const { json } = setup({});
    expect((await json('POST', '/api/feeds/opml', { opml: '<html/>' })).status).toBe(400);
  });
});
