import { DOMParser } from 'linkedom';

export type OpmlFeed = { title: string; url: string };

/**
 * Every `<outline xmlUrl>` at any depth: readers like Feedly and Inoreader nest feeds inside folder
 * outlines. Titles come from `title`, then `text`, then the feed's host.
 */
export function parseOpml(xml: string): { feeds: OpmlFeed[]; invalid: number } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (!doc.querySelector('opml')) throw new Error('Il file non è un OPML valido.');
  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const outline of doc.querySelectorAll('outline')) {
    const raw = outline.getAttribute('xmlUrl') ?? outline.getAttribute('xmlurl');
    if (!raw) continue;
    let url: string;
    try {
      const parsed = new URL(raw.trim());
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('protocol');
      url = parsed.toString();
    } catch {
      invalid++;
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const title =
      outline.getAttribute('title')?.trim() ||
      outline.getAttribute('text')?.trim() ||
      new URL(url).hostname;
    feeds.push({ title, url });
  }
  return { feeds, invalid };
}
