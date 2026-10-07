import { parseHTML } from 'linkedom';
import { httpGet, type Fetcher } from '../http.ts';
import { looksLikeFeed, parseFeed } from './parse.ts';

export type DiscoveredFeed = { url: string; title: string | null };

const FEED_TYPES = /application\/(rss|atom)\+xml|application\/feed\+json/i;
const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml'];

/** `<link rel="alternate" type="application/rss+xml">` tags, resolved against the page URL. */
export function feedLinksInHtml(html: string, pageUrl: string): DiscoveredFeed[] {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  const out: DiscoveredFeed[] = [];
  for (const link of document.querySelectorAll('link[rel~="alternate"][href]')) {
    if (!FEED_TYPES.test(link.getAttribute('type') ?? '')) continue;
    let url: string;
    try {
      url = new URL(link.getAttribute('href')!, pageUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: link.getAttribute('title')?.trim() || null });
  }
  return out;
}

function normaliseInput(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function asFeed(url: string, fetcher: Fetcher): Promise<DiscoveredFeed | null> {
  try {
    const res = await httpGet(url, fetcher, { timeoutMs: 8_000 });
    if (res.status >= 400 || !looksLikeFeed(res.contentType, res.text)) return null;
    const parsed = await parseFeed(res.text, res.url);
    return { url: res.url, title: parsed.title };
  } catch {
    return null;
  }
}

/**
 * Accepts either a feed URL or a site URL. For a site, reads the feeds the page advertises; if it
 * advertises none, tries the usual paths (/feed, /rss.xml, ...).
 */
export async function discoverFeeds(input: string, fetcher: Fetcher): Promise<DiscoveredFeed[]> {
  const url = normaliseInput(input);
  const res = await httpGet(url, fetcher);
  if (res.status >= 400) throw new Error(`Il sito ha risposto con errore ${res.status}.`);

  if (looksLikeFeed(res.contentType, res.text)) {
    const parsed = await parseFeed(res.text, res.url);
    return [{ url: res.url, title: parsed.title }];
  }

  const advertised = feedLinksInHtml(res.text, res.url);
  if (advertised.length > 0) return advertised;

  const origin = new URL(res.url).origin;
  for (const path of COMMON_PATHS) {
    const found = await asFeed(origin + path, fetcher);
    if (found) return [found];
  }
  return [];
}
