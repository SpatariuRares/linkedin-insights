import type { DB } from '../db.ts';
import type { FeedItem } from '../feeds/parse.ts';
import { canonicalUrl } from '../feeds/canonical.ts';
import { countMatched, ftsMatch, relatedTerms, searchTerms } from '../articles/search.ts';

export type Feed = {
  id: number;
  url: string;
  title: string;
  siteUrl: string | null;
  enabled: boolean;
  createdAt: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  errorCount: number;
  articleCount: number;
};

export type ArticleState = 'inbox' | 'saved' | 'discarded' | 'archived';

export type Article = {
  id: number;
  feedId: number | null;
  source: string;
  url: string;
  title: string;
  snippet: string;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  state: ArticleState;
  score: ArticleScore | null;
};

export type ArticleScore = {
  pillarId: string | null;
  pillarProb: number | null;
  relevance: number | null;
  postWorthy: boolean | null;
  postWorthyProb: number | null;
};

const FEED_COLUMNS = `f.id, f.url, f.title, f.site_url AS siteUrl, f.enabled, f.created_at AS createdAt,
  f.last_fetched_at AS lastFetchedAt, f.last_error AS lastError, f.error_count AS errorCount,
  (SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id) AS articleCount`;

type FeedRow = Omit<Feed, 'enabled'> & { enabled: number };
const toFeed = (r: FeedRow): Feed => ({ ...r, enabled: r.enabled === 1 });

export function listFeeds(db: DB): Feed[] {
  return (
    db.prepare(`SELECT ${FEED_COLUMNS} FROM feeds f ORDER BY lower(f.title)`).all() as FeedRow[]
  ).map(toFeed);
}

export function getFeed(db: DB, id: number): Feed | null {
  const row = db.prepare(`SELECT ${FEED_COLUMNS} FROM feeds f WHERE f.id = ?`).get(id) as
    FeedRow | undefined;
  return row ? toFeed(row) : null;
}

export function findFeedByUrl(db: DB, url: string): Feed | null {
  const row = db.prepare(`SELECT id FROM feeds WHERE url = ?`).get(url) as
    { id: number } | undefined;
  return row ? getFeed(db, row.id) : null;
}

export function addFeed(
  db: DB,
  feed: { url: string; title: string; siteUrl?: string | null },
  now: Date,
): Feed {
  const info = db
    .prepare('INSERT INTO feeds (url, title, site_url, created_at) VALUES (?, ?, ?, ?)')
    .run(feed.url, feed.title, feed.siteUrl ?? null, now.toISOString());
  return getFeed(db, Number(info.lastInsertRowid))!;
}

export function updateFeed(db: DB, id: number, patch: { title?: string; enabled?: boolean }) {
  if (patch.title !== undefined) {
    db.prepare('UPDATE feeds SET title = ? WHERE id = ?').run(patch.title, id);
  }
  if (patch.enabled !== undefined) {
    db.prepare('UPDATE feeds SET enabled = ? WHERE id = ?').run(patch.enabled ? 1 : 0, id);
  }
  return getFeed(db, id);
}

/** Saved articles outlive their feed (a draft may cite them); everything else goes with it. */
export function deleteFeed(db: DB, id: number) {
  db.transaction(() => {
    db.prepare(`DELETE FROM articles WHERE feed_id = ? AND state != 'saved'`).run(id);
    db.prepare('DELETE FROM feeds WHERE id = ?').run(id);
  })();
}

export function recordFetchSuccess(
  db: DB,
  id: number,
  meta: { now: Date; etag?: string | null; lastModified?: string | null; siteUrl?: string | null },
) {
  db.prepare(
    `UPDATE feeds SET last_fetched_at = ?, last_error = NULL, error_count = 0,
       etag = coalesce(?, etag), last_modified = coalesce(?, last_modified),
       site_url = coalesce(site_url, ?)
     WHERE id = ?`,
  ).run(
    meta.now.toISOString(),
    meta.etag ?? null,
    meta.lastModified ?? null,
    meta.siteUrl ?? null,
    id,
  );
}

export function recordFetchError(db: DB, id: number, message: string, now: Date) {
  db.prepare(
    `UPDATE feeds SET last_fetched_at = ?, last_error = ?, error_count = error_count + 1 WHERE id = ?`,
  ).run(now.toISOString(), message, id);
}

export function feedCacheHeaders(db: DB, id: number): Record<string, string> {
  const row = db.prepare('SELECT etag, last_modified FROM feeds WHERE id = ?').get(id) as
    { etag: string | null; last_modified: string | null } | undefined;
  const headers: Record<string, string> = {};
  if (row?.etag) headers['If-None-Match'] = row.etag;
  if (row?.last_modified) headers['If-Modified-Since'] = row.last_modified;
  return headers;
}

/**
 * Inserts the items not seen before (by canonical URL) and returns how many were new. An article
 * already known keeps its state, so a discarded one never comes back to the inbox.
 */
export function insertArticles(
  db: DB,
  feed: { id: number; title: string },
  items: FeedItem[],
  now: Date,
): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO articles
       (feed_id, source_title, canonical_url, url, guid, title, snippet, author, published_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let added = 0;
  db.transaction(() => {
    for (const item of items) {
      const url = item.url ?? item.guid!;
      const info = insert.run(
        feed.id,
        feed.title,
        canonicalUrl(url),
        url,
        item.guid,
        item.title,
        item.snippet,
        item.author,
        item.publishedAt ?? now.toISOString(),
        now.toISOString(),
      );
      added += info.changes;
    }
  })();
  return added;
}

const ARTICLE_SELECT = `SELECT a.id, a.feed_id AS feedId, a.source_title AS source, a.url, a.title,
  a.snippet, a.author, a.published_at AS publishedAt, a.fetched_at AS fetchedAt, a.state,
  s.article_id AS scored, s.pillar_id AS pillarId, s.pillar_prob AS pillarProb,
  s.relevance, s.post_worthy AS postWorthy, s.post_worthy_prob AS postWorthyProb
  FROM articles a LEFT JOIN article_scores s ON s.article_id = a.id`;

type ArticleRow = Omit<Article, 'score'> &
  Omit<ArticleScore, 'postWorthy'> & { scored: number | null; postWorthy: number | null };

function toArticle(r: ArticleRow): Article {
  const { scored, pillarId, pillarProb, relevance, postWorthy, postWorthyProb, ...rest } = r;
  return {
    ...rest,
    score:
      scored === null
        ? null
        : {
            pillarId,
            pillarProb,
            relevance,
            postWorthy: postWorthy === null ? null : postWorthy === 1,
            postWorthyProb,
          },
  };
}

export type ArticleQuery = {
  state?: ArticleState;
  feedId?: number;
  limit?: number;
  sort?: 'date' | 'relevance';
  minRelevance?: number;
  pillarId?: string;
  postWorthy?: boolean;
  /** Free text matched against title and summary; every meaningful word must appear. */
  q?: string;
};

/**
 * Filters on scores only narrow down scored articles: an article Rizzo Flow hasn't seen yet is
 * always returned (with `score: null`), so a threshold can never hide it.
 */
export function listArticles(db: DB, opts: ArticleQuery = {}): Article[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.state) {
    where.push('a.state = ?');
    params.push(opts.state);
  }
  if (opts.feedId !== undefined) {
    where.push('a.feed_id = ?');
    params.push(opts.feedId);
  }
  const terms = opts.q ? searchTerms(opts.q) : [];
  if (terms.length) {
    where.push('a.id IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)');
    params.push(ftsMatch(terms, 'all'));
  }
  const scoreFilters: string[] = [];
  if (opts.minRelevance !== undefined) {
    scoreFilters.push('coalesce(s.relevance, 0) >= ?');
    params.push(opts.minRelevance);
  }
  if (opts.pillarId !== undefined) {
    scoreFilters.push('s.pillar_id = ?');
    params.push(opts.pillarId);
  }
  if (opts.postWorthy !== undefined) {
    scoreFilters.push('s.post_worthy = ?');
    params.push(opts.postWorthy ? 1 : 0);
  }
  if (scoreFilters.length) {
    where.push(`(s.article_id IS NULL OR (${scoreFilters.join(' AND ')}))`);
  }
  params.push(opts.limit ?? 200);
  const order =
    opts.sort === 'relevance'
      ? 's.relevance IS NULL, s.relevance DESC, a.published_at DESC, a.id DESC'
      : 'a.published_at DESC, a.id DESC';
  return (
    db
      .prepare(
        `${ARTICLE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY ${order} LIMIT ?`,
      )
      .all(...params) as ArticleRow[]
  ).map(toArticle);
}

/**
 * Other articles on the same story as `article`: any of its headline words may match, ranked by
 * bm25 (title weighs more than summary), then cut to those sharing at least two words so a single
 * common name ("Nvidia", "Cina") is not enough. Discarded articles stay out; archived ones count.
 */
export function relatedArticles(db: DB, article: Article, limit = 10): Article[] {
  const terms = relatedTerms(article.title);
  if (!terms.length) return [];
  const minShared = Math.min(2, terms.length);
  const rows = db
    .prepare(
      `${ARTICLE_SELECT}
       JOIN (SELECT rowid AS id, bm25(articles_fts, 4.0, 1.0) AS rank
             FROM articles_fts WHERE articles_fts MATCH ? ORDER BY rank LIMIT 100) m ON m.id = a.id
       WHERE a.id != ? AND a.state != 'discarded'
       ORDER BY m.rank`,
    )
    .all(ftsMatch(terms, 'any'), article.id) as ArticleRow[];
  return rows
    .filter((r) => countMatched(terms, `${r.title} ${r.snippet}`) >= minShared)
    .slice(0, limit)
    .map(toArticle);
}

/** The articles the topic graph is drawn from: recent, not discarded, newest first. */
export function graphArticles(
  db: DB,
  opts: { since: Date; includeArchived: boolean; limit: number },
): Article[] {
  const states = opts.includeArchived ? "('inbox', 'saved', 'archived')" : "('inbox', 'saved')";
  return (
    db
      .prepare(
        `${ARTICLE_SELECT} WHERE a.state IN ${states} AND a.published_at >= ?
         ORDER BY a.published_at DESC, a.id DESC LIMIT ?`,
      )
      .all(opts.since.toISOString(), opts.limit) as ArticleRow[]
  ).map(toArticle);
}

export function getArticle(db: DB, id: number): Article | null {
  const row = db.prepare(`${ARTICLE_SELECT} WHERE a.id = ?`).get(id) as ArticleRow | undefined;
  return row ? toArticle(row) : null;
}

export function setArticleState(db: DB, id: number, state: ArticleState, now: Date) {
  db.prepare('UPDATE articles SET state = ?, state_changed_at = ? WHERE id = ?').run(
    state,
    now.toISOString(),
    id,
  );
  return getArticle(db, id);
}

export function countArticles(db: DB): Record<ArticleState, number> {
  const counts = { inbox: 0, saved: 0, discarded: 0, archived: 0 };
  for (const row of db
    .prepare('SELECT state, COUNT(*) AS n FROM articles GROUP BY state')
    .all() as { state: ArticleState; n: number }[]) {
    counts[row.state] = row.n;
  }
  return counts;
}
