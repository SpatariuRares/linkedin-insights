import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '../db.ts';
import type { Fetcher } from '../http.ts';
import { describeFetchError } from '../http.ts';
import { idParam, parseBody } from '../validate.ts';
import { discoverFeeds } from '../feeds/discover.ts';
import { refreshFeed } from '../feeds/refresh.ts';
import { parseOpml } from '../feeds/opml.ts';
import { getArticleText } from '../articles/text.ts';
import type { FeedScheduler } from '../feeds/scheduler.ts';
import type { TriageRunner } from '../triage/runner.ts';
import {
  addFeed,
  countArticles,
  deleteFeed,
  findFeedByUrl,
  getArticle,
  getFeed,
  listArticles,
  listFeeds,
  setArticleState,
  updateFeed,
} from '../store/feeds.ts';

export type FeedDeps = {
  db: DB;
  fetcher: Fetcher;
  now: () => Date;
  scheduler: FeedScheduler;
  triage: TriageRunner;
};

const opmlSchema = z.object({ opml: z.string().min(1).max(2_000_000) });
const discoverSchema = z.object({ url: z.string().min(3) });
const addSchema = z.object({ url: z.url(), title: z.string().trim().min(1).max(200) });
const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
});
const articlePatch = z.object({ state: z.enum(['inbox', 'saved', 'discarded']) });
const articleQuery = z.object({
  state: z.enum(['inbox', 'saved', 'discarded', 'archived']).optional(),
  feedId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  sort: z.enum(['date', 'relevance']).optional(),
  minRelevance: z.coerce.number().min(0).max(4).optional(),
  pillarId: z.string().min(1).optional(),
  postWorthy: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export function feedRoutes({ db, fetcher, now, scheduler, triage }: FeedDeps) {
  const app = new Hono();

  app.post('/feeds/discover', async (c) => {
    const body = await parseBody(c, discoverSchema);
    if (body.error) return body.error;
    try {
      const feeds = await discoverFeeds(body.data.url, fetcher);
      return c.json({
        feeds: feeds.map((f) => ({ ...f, alreadyAdded: findFeedByUrl(db, f.url) !== null })),
      });
    } catch (err) {
      return c.json({ error: `Impossibile leggere il sito: ${describeFetchError(err)}` }, 502);
    }
  });

  app.get('/feeds', (c) => c.json(listFeeds(db)));

  app.post('/feeds', async (c) => {
    const body = await parseBody(c, addSchema);
    if (body.error) return body.error;
    if (findFeedByUrl(db, body.data.url)) {
      return c.json({ error: 'Questo feed è già nella lista.' }, 409);
    }
    const feed = addFeed(db, body.data, now());
    const result = await refreshFeed(db, feed.id, { fetcher, now });
    return c.json({ feed: getFeed(db, feed.id), added: result.added, error: result.error }, 201);
  });

  app.patch('/feeds/:id', async (c) => {
    const id = idParam(c);
    if (!id || !getFeed(db, id)) return c.json({ error: 'Feed non trovato.' }, 404);
    const body = await parseBody(c, patchSchema);
    if (body.error) return body.error;
    return c.json(updateFeed(db, id, body.data));
  });

  app.delete('/feeds/:id', (c) => {
    const id = idParam(c);
    if (!id || !getFeed(db, id)) return c.json({ error: 'Feed non trovato.' }, 404);
    deleteFeed(db, id);
    return c.body(null, 204);
  });

  /** Adds every feed in an OPML export; the new feeds are fetched in the background. */
  app.post('/feeds/opml', async (c) => {
    const body = await parseBody(c, opmlSchema);
    if (body.error) return body.error;
    let parsed;
    try {
      parsed = parseOpml(body.data.opml);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
    let added = 0;
    let existing = 0;
    db.transaction(() => {
      for (const feed of parsed.feeds) {
        if (findFeedByUrl(db, feed.url)) existing++;
        else {
          addFeed(db, feed, now());
          added++;
        }
      }
    })();
    if (added > 0) void scheduler.runNow();
    return c.json({ added, existing, invalid: parsed.invalid });
  });

  app.get('/triage/status', async (c) => {
    await triage.checkOnline();
    return c.json(triage.status());
  });

  app.post('/triage/run', async (c) => {
    const scored = await triage.runNow();
    return c.json({ scored, ...triage.status() });
  });

  app.get('/feeds/status', (c) => c.json(scheduler.status()));

  app.post('/feeds/refresh', async (c) => {
    const { results } = await scheduler.runNow();
    return c.json({
      refreshed: results.length,
      added: results.reduce((s, r) => s + r.added, 0),
      failed: results.filter((r) => r.error).length,
    });
  });

  app.post('/feeds/:id/refresh', async (c) => {
    const id = idParam(c);
    if (!id || !getFeed(db, id)) return c.json({ error: 'Feed non trovato.' }, 404);
    const result = await refreshFeed(db, id, { fetcher, now });
    return c.json({ ...result, feed: getFeed(db, id) });
  });

  app.get('/articles', (c) => {
    const query = articleQuery.safeParse(c.req.query());
    if (!query.success) return c.json({ error: 'Parametri non validi.' }, 400);
    return c.json(listArticles(db, query.data));
  });

  app.get('/articles/counts', (c) => c.json(countArticles(db)));

  app.get('/articles/:id/text', async (c) => {
    const id = idParam(c);
    const text = id ? await getArticleText(db, id, { fetcher }) : null;
    if (!text) return c.json({ error: 'Articolo non trovato.' }, 404);
    return c.json(text);
  });

  app.patch('/articles/:id', async (c) => {
    const id = idParam(c);
    if (!id || !getArticle(db, id)) return c.json({ error: 'Articolo non trovato.' }, 404);
    const body = await parseBody(c, articlePatch);
    if (body.error) return body.error;
    return c.json(setArticleState(db, id, body.data.state, now()));
  });

  return app;
}
