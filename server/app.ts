import { Hono } from 'hono';
import type { DB } from './db.ts';
import type { Fetcher } from './http.ts';
import { parseBody } from './validate.ts';
import { feedRoutes } from './routes/feeds.ts';
import { profileRoutes } from './routes/profiles.ts';
import { voiceRoutes } from './routes/voice.ts';
import { draftRoutes } from './routes/drafts.ts';
import { generate as llmGenerate } from './llm/index.ts';
import type { GenerateFn } from './agent/run.ts';
import { FeedScheduler } from './feeds/scheduler.ts';
import { TriageRunner } from './triage/runner.ts';
import {
  appStateSchema,
  calendarSchema,
  goalSchema,
  importRequestSchema,
} from '../src/lib/schemas';
import { defaultState } from '../src/lib/storage';
import { mergeExport } from '../src/lib/history';
import {
  getHistory,
  getState,
  hasUserData,
  setCalendar,
  setGoal,
  setHistory,
  setState,
} from './store/state.ts';

/**
 * The HTTP surface of the local server. Kept free of I/O setup (ports, files) so tests can drive it
 * with `app.request()` and an in-memory database.
 */
export type AppDeps = {
  db: DB;
  now?: () => Date;
  fetcher?: Fetcher;
  scheduler?: FeedScheduler;
  triage?: TriageRunner;
  env?: Record<string, string | undefined>;
  /** Text generation; tests pass a fake so no model is ever called. */
  generate?: GenerateFn;
};

export function createApp({
  db,
  now = () => new Date(),
  fetcher = fetch,
  scheduler = new FeedScheduler({ db, fetcher, now }),
  triage = new TriageRunner({ db, fetcher, now }),
  env = process.env,
  generate = (profile, input) => llmGenerate(profile, input, { fetcher, env }),
}: AppDeps) {
  const app = new Hono().basePath('/api');

  app.onError((err, c) => {
    console.error('[api]', err);
    return c.json({ error: err.message || 'Errore interno del server.' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/state', (c) => c.json(getState(db)));

  app.put('/state', async (c) => {
    const body = await parseBody(c, appStateSchema);
    if (body.error) return body.error;
    setState(db, body.data);
    return c.json(getState(db));
  });

  app.delete('/state', (c) => {
    setState(db, defaultState());
    return c.json(getState(db));
  });

  /**
   * One-time move of the state the browser kept in localStorage. Refuses (409) once the database
   * has user data, so a stale browser can never overwrite what the server holds.
   */
  app.post('/migrate', async (c) => {
    const body = await parseBody(c, appStateSchema);
    if (body.error) return body.error;
    if (hasUserData(db)) {
      return c.json({ error: 'Il database contiene già dei dati: migrazione saltata.' }, 409);
    }
    setState(db, body.data);
    return c.json(getState(db));
  });

  app.put('/state/goal', async (c) => {
    const body = await parseBody(c, goalSchema);
    if (body.error) return body.error;
    setGoal(db, body.data);
    return c.json(body.data);
  });

  app.put('/state/calendar', async (c) => {
    const body = await parseBody(c, calendarSchema);
    if (body.error) return body.error;
    setCalendar(db, body.data);
    return c.json(body.data);
  });

  app.post('/history/import', async (c) => {
    const body = await parseBody(c, importRequestSchema);
    if (body.error) return body.error;
    const merged = mergeExport(getHistory(db), body.data.data, {
      fileName: body.data.fileName,
      importedAt: now().toISOString(),
    });
    setHistory(db, merged);
    return c.json(getHistory(db));
  });

  app.route('/', feedRoutes({ db, fetcher, now, scheduler, triage }));
  app.route('/', profileRoutes({ db, fetcher, env, now }));
  app.route('/', voiceRoutes({ db }));
  app.route('/', draftRoutes({ db, fetcher, generate, now }));

  return app;
}

export type App = ReturnType<typeof createApp>;
