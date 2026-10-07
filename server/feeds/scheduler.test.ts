// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../db.ts';
import { addFeed, insertArticles, listArticles, listFeeds } from '../store/feeds.ts';
import { fakeFetch, fixture } from '../test-fetch.ts';
import { archiveStale, FeedScheduler, REFRESH_EVERY_MS } from './scheduler.ts';

const RSS = 'https://blog.example.com/feed.xml';
const BROKEN = 'https://broken.example.com/feed.xml';

describe('FeedScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  function setup() {
    const db = openDb(':memory:');
    const { fetcher, calls } = fakeFetch({
      [RSS]: { body: fixture('rss.xml'), type: 'text/xml' },
      [BROKEN]: { status: 503, body: 'down' },
    });
    const scheduler = new FeedScheduler({ db, fetcher, now: () => new Date() });
    return { db, scheduler, calls };
  }

  it('refreshes on start and again every 30 minutes', async () => {
    const { db, scheduler, calls } = setup();
    addFeed(db, { url: RSS, title: 'Blog' }, new Date());
    scheduler.start();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(REFRESH_EVERY_MS - 1000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    scheduler.stop();
  });

  it('joins a run already in progress instead of starting another', async () => {
    const { db, scheduler, calls } = setup();
    addFeed(db, { url: RSS, title: 'Blog' }, new Date());
    const a = scheduler.runNow();
    const b = scheduler.runNow();
    expect(a).toBe(b);
    await a;
    expect(calls).toHaveLength(1);
  });

  it('keeps going past a broken feed, counts its errors and resets them on success', async () => {
    const { db, scheduler } = setup();
    const broken = addFeed(db, { url: BROKEN, title: 'Rotto' }, new Date());
    addFeed(db, { url: RSS, title: 'Blog' }, new Date());
    for (let i = 0; i < 3; i++) await scheduler.runNow();

    const feeds = listFeeds(db);
    expect(feeds.find((f) => f.title === 'Rotto')).toMatchObject({ errorCount: 3 });
    expect(feeds.find((f) => f.title === 'Blog')).toMatchObject({ errorCount: 0, articleCount: 2 });

    db.prepare('UPDATE feeds SET url = ? WHERE id = ?').run(RSS + '?ok', broken.id);
    const { fetcher } = fakeFetch({
      [RSS + '?ok']: { body: fixture('atom.xml'), type: 'text/xml' },
    });
    const healed = new FeedScheduler({ db, fetcher, now: () => new Date() });
    await healed.runNow();
    expect(listFeeds(db).find((f) => f.title === 'Rotto')).toMatchObject({
      errorCount: 0,
      lastError: null,
    });
  });

  it('sends the stored ETag on the next request', async () => {
    const db = openDb(':memory:');
    const { fetcher, calls } = fakeFetch({
      [RSS]: { body: fixture('rss.xml'), type: 'text/xml', headers: { etag: '"v1"' } },
    });
    addFeed(db, { url: RSS, title: 'Blog' }, new Date());
    const scheduler = new FeedScheduler({ db, fetcher, now: () => new Date() });
    await scheduler.runNow();
    await scheduler.runNow();
    expect(calls[1].headers['If-None-Match']).toBe('"v1"');
  });
});

describe('archiveStale', () => {
  it('archives inbox articles older than 14 days and leaves saved ones alone', () => {
    const db = openDb(':memory:');
    const feed = addFeed(db, { url: RSS, title: 'Blog' }, new Date());
    const item = (url: string) => ({
      guid: null,
      url,
      title: url,
      snippet: '',
      author: null,
      publishedAt: null,
    });
    insertArticles(
      db,
      feed,
      [item('https://a.example/old'), item('https://a.example/kept')],
      new Date('2026-09-20T10:00:00Z'),
    );
    insertArticles(db, feed, [item('https://a.example/new')], new Date('2026-10-01T10:00:00Z'));
    db.prepare(`UPDATE articles SET state = 'saved' WHERE url = 'https://a.example/kept'`).run();

    expect(archiveStale(db, new Date('2026-10-07T10:00:00Z'))).toBe(1);
    expect(listArticles(db, { state: 'archived' }).map((a) => a.url)).toEqual([
      'https://a.example/old',
    ]);
    expect(listArticles(db, { state: 'inbox' }).map((a) => a.url)).toEqual([
      'https://a.example/new',
    ]);
  });
});
