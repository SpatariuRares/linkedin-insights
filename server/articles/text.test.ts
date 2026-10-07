// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { openDb } from '../db.ts';
import { addFeed, insertArticles } from '../store/feeds.ts';
import { fakeFetch, fixture } from '../test-fetch.ts';
import { extractArticleText } from './extract.ts';
import { getArticleText } from './text.ts';

const URL_OK = 'https://blog.example.com/react-compiler';
const URL_PAYWALL = 'https://news.example.com/paywall';

describe('extractArticleText', () => {
  it('keeps the article body and drops navigation, sidebar and footer', () => {
    const text = extractArticleText(fixture('article.html'), URL_OK)!;
    expect(text).toContain('Il React Compiler analizza i componenti');
    expect(text).toContain('codemod ufficiale');
    expect(text).not.toContain('Iscriviti alla newsletter');
    expect(text).not.toContain('Privacy');
  });

  it('returns null for a page with no real article', () => {
    expect(
      extractArticleText('<html><body><p>Accedi per continuare.</p></body></html>', URL_OK),
    ).toBeNull();
  });
});

describe('getArticleText', () => {
  function setup(routes: Parameters<typeof fakeFetch>[0]) {
    const db = openDb(':memory:');
    const feed = addFeed(
      db,
      { url: 'https://blog.example.com/feed.xml', title: 'Blog' },
      new Date(),
    );
    const item = (url: string, snippet: string) => ({
      guid: null,
      url,
      title: url,
      snippet,
      author: null,
      publishedAt: null,
    });
    insertArticles(
      db,
      feed,
      [item(URL_OK, 'Anteprima breve.'), item(URL_PAYWALL, 'Solo il riassunto del feed.')],
      new Date(),
    );
    const id = (url: string) =>
      (db.prepare('SELECT id FROM articles WHERE url = ?').get(url) as { id: number }).id;
    return { db, id, ...fakeFetch(routes) };
  }

  it('reads the full page once and serves it from the database afterwards', async () => {
    const { db, id, fetcher, calls } = setup({ [URL_OK]: { body: fixture('article.html') } });
    const first = await getArticleText(db, id(URL_OK), { fetcher });
    expect(first).toMatchObject({ fullText: true, source: 'Blog' });
    expect(first!.text).toContain('codemod ufficiale');

    const second = await getArticleText(db, id(URL_OK), { fetcher });
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });

  it('falls back to the feed snippet and says so when the page is blocked', async () => {
    const { db, id, fetcher, calls } = setup({ [URL_PAYWALL]: { status: 403, body: 'Abbonati' } });
    const text = await getArticleText(db, id(URL_PAYWALL), { fetcher });
    expect(text).toMatchObject({ fullText: false, text: 'Solo il riassunto del feed.' });
    await getArticleText(db, id(URL_PAYWALL), { fetcher });
    expect(calls).toHaveLength(1);
  });

  it('falls back when the network fails', async () => {
    const { db, id } = setup({});
    const failing = async () => {
      throw new TypeError('fetch failed');
    };
    const text = await getArticleText(db, id(URL_OK), { fetcher: failing });
    expect(text).toMatchObject({ fullText: false, text: 'Anteprima breve.' });
  });
});
