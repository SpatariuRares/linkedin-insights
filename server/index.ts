import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { DB_FILE, HOST, PORT } from './config.ts';
import { openDb } from './db.ts';
import { FeedScheduler } from './feeds/scheduler.ts';
import { TriageRunner } from './triage/runner.ts';

const db = openDb(DB_FILE);
const now = () => new Date();
const triage = new TriageRunner({ db, fetcher: fetch, now });
const scheduler = new FeedScheduler({
  db,
  fetcher: fetch,
  now,
  afterRun: () => void triage.runNow(),
});
const app = createApp({ db, now, scheduler, triage });
scheduler.start();
triage.start();

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`[api] in ascolto su http://${info.address}:${info.port} · db ${DB_FILE}`);
});

function shutdown() {
  scheduler.stop();
  triage.stop();
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
