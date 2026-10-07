import { createApp } from './app.ts';
import { openDb } from './db.ts';

export function testApp(now = new Date('2026-10-07T10:00:00.000Z')) {
  const db = openDb(':memory:');
  const app = createApp({ db, now: () => now });
  const json = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { db, app, json };
}
