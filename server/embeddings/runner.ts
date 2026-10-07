import type { DB } from '../db.ts';
import type { Fetcher } from '../http.ts';
import { embedTexts } from '../llm/embeddings.ts';
import {
  countEmbeddings,
  countPendingEmbeddings,
  embeddingText,
  getEmbeddingConfig,
  pendingEmbeddings,
  saveEmbeddings,
} from '../store/embeddings.ts';

export const EMBED_EVERY_MS = 5 * 60_000;
const BATCH = 64;
/** Per run, so a first backfill of thousands of articles is spread over a few runs. */
const MAX_BATCHES_PER_RUN = 40;

type Deps = {
  db: DB;
  fetcher: Fetcher;
  env: Record<string, string | undefined>;
  now: () => Date;
  intervalMs?: number;
};

/**
 * Keeps every non-discarded article embedded with the configured model, in the background. When
 * search by meaning is off, the key is missing or the provider fails, it embeds nothing and the
 * app falls back to keyword matching.
 */
export class EmbeddingRunner {
  private deps: Deps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: Promise<number> | null = null;
  lastRunAt: string | null = null;
  lastError: string | null = null;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  get running() {
    return this.current !== null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runNow(), this.deps.intervalMs ?? EMBED_EVERY_MS);
    void this.runNow();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Embeds pending articles in batches; returns how many got a vector. */
  runNow(): Promise<number> {
    if (this.current) return this.current;
    this.current = (async () => {
      const { db, fetcher, env, now } = this.deps;
      const config = getEmbeddingConfig(db);
      if (!config.enabled) {
        this.lastError = null;
        return 0;
      }
      let embedded = 0;
      try {
        for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
          const pending = pendingEmbeddings(db, config.model, BATCH);
          if (!pending.length) break;
          const vectors = await embedTexts(config, pending.map(embeddingText), { fetcher, env });
          saveEmbeddings(
            db,
            config.model,
            pending.map((a, i) => ({ id: a.id, vector: vectors[i] })),
            now(),
          );
          embedded += pending.length;
        }
        this.lastError = null;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      } finally {
        this.lastRunAt = now().toISOString();
        this.current = null;
      }
      return embedded;
    })();
    return this.current;
  }

  status() {
    const { db, env } = this.deps;
    const config = getEmbeddingConfig(db);
    return {
      ...config,
      keyPresent: config.apiKeyEnv ? Boolean(env[config.apiKeyEnv]?.trim()) : null,
      embedded: countEmbeddings(db, config.model),
      pending: countPendingEmbeddings(db, config.model),
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
    };
  }
}
