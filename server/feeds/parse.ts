import Parser from 'rss-parser';
import { parseHTML } from 'linkedom';

export type FeedItem = {
  guid: string | null;
  url: string | null;
  title: string;
  snippet: string;
  author: string | null;
  publishedAt: string | null;
};

export type ParsedFeed = { title: string | null; siteUrl: string | null; items: FeedItem[] };

const SNIPPET_MAX = 600;
const parser = new Parser();

const { document } = parseHTML('<!doctype html><html><body></body></html>');
const scratch = document.createElement('div');

/**
 * Feeds often carry HTML (tags, `&#8217;`, `&amp;`) inside titles and summaries. Letting an HTML
 * parser read it strips the tags and decodes every entity in one go.
 */
function clean(text: unknown): string {
  // rss-parser hands back objects for elements with children; one odd field must not sink the feed.
  if (!text || typeof text !== 'string') return '';
  scratch.innerHTML = text.replace(/<(br|\/p|\/div|\/li)\b[^>]*>/gi, ' $&');
  return (scratch.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function snippetOf(item: Parser.Item): string {
  const text = clean(item.contentSnippet || item.summary || item.content);
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : text;
}

/** `<author>` is usually text, but some feeds (blog.google) nest `<name>`, which xml2js arrays. */
function authorOf(item: Parser.Item): string | null {
  const raw: unknown = item.creator ?? (item as { author?: unknown }).author;
  const name = raw && typeof raw === 'object' ? (raw as { name?: unknown }).name : raw;
  return clean(Array.isArray(name) ? name[0] : name) || null;
}

function isoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** RSS 2.0, RSS 1.0 and Atom, normalised to the few fields the inbox needs. */
export async function parseFeed(xml: string, baseUrl?: string): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);
  const resolve = (link: string | undefined) => {
    if (!link) return null;
    try {
      return new URL(link.trim(), baseUrl).toString();
    } catch {
      return null;
    }
  };
  return {
    title: clean(feed.title) || null,
    siteUrl: resolve(feed.link),
    items: feed.items
      .map((item) => ({
        guid: item.guid?.trim() || null,
        url: resolve(item.link),
        title: clean(item.title) || '(senza titolo)',
        snippet: snippetOf(item),
        author: authorOf(item),
        publishedAt: isoOrNull(item.isoDate ?? item.pubDate),
      }))
      .filter((item) => item.url || item.guid),
  };
}

export function looksLikeFeed(contentType: string, body: string): boolean {
  if (/(rss|atom)\+xml|\/xml|text\/xml/i.test(contentType)) return true;
  const head = body.trimStart().slice(0, 500).toLowerCase();
  return head.startsWith('<?xml') || head.startsWith('<rss') || head.startsWith('<feed');
}
