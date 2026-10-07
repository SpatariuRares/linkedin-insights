import type { DB } from '../db.ts';
import { describeFetchError, httpGet, type Fetcher } from '../http.ts';
import { parseFeed } from './parse.ts';
import {
  feedCacheHeaders,
  getFeed,
  insertArticles,
  recordFetchError,
  recordFetchSuccess,
} from '../store/feeds.ts';

export type RefreshResult = { feedId: number; added: number; error: string | null };

/** Downloads one feed and stores its new articles. Never throws: errors are recorded on the feed. */
export async function refreshFeed(
  db: DB,
  feedId: number,
  deps: { fetcher: Fetcher; now: () => Date },
): Promise<RefreshResult> {
  const feed = getFeed(db, feedId);
  if (!feed) return { feedId, added: 0, error: 'Feed non trovato.' };
  try {
    const res = await httpGet(feed.url, deps.fetcher, { headers: feedCacheHeaders(db, feedId) });
    if (res.status === 304) {
      recordFetchSuccess(db, feedId, { now: deps.now() });
      return { feedId, added: 0, error: null };
    }
    if (res.status >= 400) throw new Error(`Il feed ha risposto con errore ${res.status}.`);
    const parsed = await parseFeed(res.text, res.url);
    const added = insertArticles(db, feed, parsed.items, deps.now());
    recordFetchSuccess(db, feedId, {
      now: deps.now(),
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      siteUrl: parsed.siteUrl,
    });
    return { feedId, added, error: null };
  } catch (err) {
    const message = describeFetchError(err);
    recordFetchError(db, feedId, message, deps.now());
    return { feedId, added: 0, error: message };
  }
}

/** Refreshes every enabled feed, one at a time, so a slow or broken one can't starve the others. */
export async function refreshAllFeeds(
  db: DB,
  deps: { fetcher: Fetcher; now: () => Date },
): Promise<RefreshResult[]> {
  const ids = (
    db.prepare('SELECT id FROM feeds WHERE enabled = 1 ORDER BY id').all() as {
      id: number;
    }[]
  ).map((r) => r.id);
  const results: RefreshResult[] = [];
  for (const id of ids) results.push(await refreshFeed(db, id, deps));
  return results;
}
