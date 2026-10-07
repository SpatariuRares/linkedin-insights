// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalUrl } from './canonical.ts';
import { looksLikeFeed, parseFeed } from './parse.ts';
import { discoverFeeds, feedLinksInHtml } from './discover.ts';
import { fakeFetch, fixture } from '../test-fetch.ts';

describe('canonicalUrl', () => {
  it('drops tracking params, fragment, trailing slash and www', () => {
    expect(canonicalUrl('https://www.Example.com/a/b/?utm_source=x&id=2#top')).toBe(
      'https://example.com/a/b?id=2',
    );
    expect(canonicalUrl('https://example.com/a/b')).toBe('https://example.com/a/b');
    expect(canonicalUrl('https://example.com/')).toBe('https://example.com');
  });

  it('keeps meaningful params in a stable order', () => {
    expect(canonicalUrl('https://example.com/p?b=2&a=1')).toBe(
      canonicalUrl('https://example.com/p?a=1&b=2'),
    );
  });
});

describe('parseFeed', () => {
  it('normalises RSS items: plain-text snippet, ISO date, absolute links', async () => {
    const feed = await parseFeed(fixture('rss.xml'), 'https://blog.example.com/feed.xml');
    expect(feed.title).toBe('Blog Frontend');
    expect(feed.items[0]).toEqual({
      guid: 'https://blog.example.com/?p=1',
      url: 'https://blog.example.com/react-compiler/?utm_source=rss',
      title: 'React Compiler di default',
      snippet: 'Il compilatore è ora attivo di default.',
      author: 'Ada',
      publishedAt: '2026-10-05T09:00:00.000Z',
    });
    expect(feed.items[1].url).toBe('https://blog.example.com/relativo');
    expect(feed.items[1].title).toBe('Tesla’s notizia & senza data');
    expect(feed.items[1].publishedAt).toBeNull();
  });

  it('reads Atom feeds', async () => {
    const feed = await parseFeed(fixture('atom.xml'));
    expect(feed.title).toBe('AI Weekly');
    expect(feed.items[0]).toMatchObject({
      url: 'https://ai.example.org/posts/modello-open',
      title: 'Un nuovo modello open',
      snippet: 'Rilasciato con licenza Apache.',
      publishedAt: '2026-10-06T12:00:00.000Z',
    });
  });

  it('recognises a feed by content type or by its first tag', () => {
    expect(looksLikeFeed('application/rss+xml; charset=utf-8', '')).toBe(true);
    expect(looksLikeFeed('text/plain', '  <?xml version="1.0"?><rss>')).toBe(true);
    expect(looksLikeFeed('text/html', '<!doctype html>')).toBe(false);
  });
});

describe('discovery', () => {
  it('finds the feeds a page advertises, resolving relative links', () => {
    expect(feedLinksInHtml(fixture('site.html'), 'https://example.com/blog/')).toEqual([
      { url: 'https://example.com/feed.xml', title: 'Articoli' },
      { url: 'https://example.com/comments.atom', title: 'Commenti' },
    ]);
  });

  it('returns the URL itself when it is already a feed', async () => {
    const { fetcher } = fakeFetch({
      'https://ai.example.org/atom.xml': {
        body: fixture('atom.xml'),
        type: 'application/atom+xml',
      },
    });
    expect(await discoverFeeds('https://ai.example.org/atom.xml', fetcher)).toEqual([
      { url: 'https://ai.example.org/atom.xml', title: 'AI Weekly' },
    ]);
  });

  it('adds https:// and falls back to common paths when the page advertises nothing', async () => {
    const { fetcher } = fakeFetch({
      'https://plain.example.com': { body: '<html><head></head></html>' },
      'https://plain.example.com/rss.xml': { body: fixture('rss.xml'), type: 'text/xml' },
    });
    expect(await discoverFeeds('plain.example.com', fetcher)).toEqual([
      { url: 'https://plain.example.com/rss.xml', title: 'Blog Frontend' },
    ]);
  });
});

describe('parseOpml', () => {
  it('collects nested feeds once each, counting invalid ones', async () => {
    const { parseOpml } = await import('./opml.ts');
    expect(parseOpml(fixture('feeds.opml'))).toEqual({
      feeds: [
        { title: 'Blog Frontend', url: 'https://blog.example.com/feed.xml' },
        { title: 'AI Weekly (Atom)', url: 'https://ai.example.org/atom.xml' },
        { title: 'senzanome.example.net', url: 'https://senzanome.example.net/rss' },
      ],
      invalid: 1,
    });
  });

  it('rejects a file that is not OPML', async () => {
    const { parseOpml } = await import('./opml.ts');
    expect(() => parseOpml('<html></html>')).toThrow(/OPML/);
  });
});
