import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations.ts';

export type DB = Database.Database;

/**
 * Opens (or creates) the database and brings its schema up to date. `PRAGMA user_version` records
 * how many migrations have run, so each one is applied exactly once and in order.
 */
export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: DB) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
