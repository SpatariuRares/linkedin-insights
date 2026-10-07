import type { DB } from '../db.ts';
import type { EmbeddingConfig } from '../llm/embeddings.ts';

const KEY = 'embeddings';

export function getEmbeddingConfig(db: DB): EmbeddingConfig {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as
    { value: string } | undefined;
  if (!row) throw new Error('Impostazione mancante: embeddings');
  return JSON.parse(row.value) as EmbeddingConfig;
}

/** Saves the config; switching model drops the old vectors, which are not comparable. */
export function setEmbeddingConfig(db: DB, config: EmbeddingConfig) {
  db.transaction(() => {
    if (getEmbeddingConfig(db).model !== config.model)
      db.prepare('DELETE FROM article_embeddings').run();
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(config), KEY);
  })();
}

const toBlob = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
// Copy into a fresh buffer: a Buffer from SQLite may not sit on a 4-byte boundary.
const fromBlob = (b: Buffer) => new Float32Array(Uint8Array.from(b).buffer);

/** Title plus summary: enough to tell stories apart, short enough for any embedding model. */
export const embeddingText = (a: { title: string; snippet: string }) =>
  `${a.title}\n${a.snippet}`.slice(0, 1000);

/** Articles without a vector for `model`, newest first; discarded ones are never embedded. */
export function pendingEmbeddings(db: DB, model: string, limit: number) {
  return db
    .prepare(
      `SELECT a.id, a.title, a.snippet FROM articles a
       LEFT JOIN article_embeddings e ON e.article_id = a.id AND e.model = ?
       WHERE e.article_id IS NULL AND a.state != 'discarded'
       ORDER BY a.published_at DESC, a.id DESC LIMIT ?`,
    )
    .all(model, limit) as { id: number; title: string; snippet: string }[];
}

export function countPendingEmbeddings(db: DB, model: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM articles a
         LEFT JOIN article_embeddings e ON e.article_id = a.id AND e.model = ?
         WHERE e.article_id IS NULL AND a.state != 'discarded'`,
      )
      .get(model) as { n: number }
  ).n;
}

export function countEmbeddings(db: DB, model: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM article_embeddings WHERE model = ?').get(model) as {
      n: number;
    }
  ).n;
}

export function saveEmbeddings(
  db: DB,
  model: string,
  rows: { id: number; vector: Float32Array }[],
  now: Date,
) {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO article_embeddings (article_id, model, vector, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const r of rows) insert.run(r.id, model, toBlob(r.vector), now.toISOString());
  })();
}

/** Vectors for `model`; restricted to `ids` when given, else every article that is not discarded. */
export function loadEmbeddings(db: DB, model: string, ids?: number[]): Map<number, Float32Array> {
  const rows = ids
    ? ids.length
      ? (db
          .prepare(
            `SELECT article_id AS id, vector FROM article_embeddings
             WHERE model = ? AND article_id IN (${ids.map(() => '?').join(',')})`,
          )
          .all(model, ...ids) as { id: number; vector: Buffer }[])
      : []
    : (db
        .prepare(
          `SELECT e.article_id AS id, e.vector FROM article_embeddings e
           JOIN articles a ON a.id = e.article_id
           WHERE e.model = ? AND a.state != 'discarded'`,
        )
        .all(model) as { id: number; vector: Buffer }[]);
  return new Map(rows.map((r) => [r.id, fromBlob(r.vector)]));
}
