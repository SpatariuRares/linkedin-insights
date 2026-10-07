import type { DB } from '../db.ts';
import type { Fetcher } from '../http.ts';
import { refreshAllFeeds, type RefreshResult } from './refresh.ts';

export const REFRESH_EVERY_MS = 30 * 60_000;
export const ARCHIVE_AFTER_DAYS = 14;

export type RefreshRun = { startedAt: string; finishedAt: string; results: RefreshResult[] };

/** Inbox articles that sat untouched for `days` days leave the inbox (they are not deleted). */
export function archiveStale(db: DB, now: Date, days = ARCHIVE_AFTER_DAYS): number {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  return db
    .prepare(
      `UPDATE articles SET state = 'archived', state_changed_at = ?
       WHERE state = 'inbox' AND fetched_at < ?`,
    )
    .run(now.toISOString(), cutoff).changes;
}

type SchedulerDeps = {
  db: DB;
  fetcher: Fetcher;
  now: () => Date;
  intervalMs?: number;
  /** Called after every run, e.g. to score the new articles. */
  afterRun?: () => void;
};

/**
 * Refreshes every enabled feed on start and then every 30 minutes. A run requested while another
 * is in progress joins it instead of starting a second one.
 */
export class FeedScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: Promise<RefreshRun> | null = null;
  lastRun: RefreshRun | null = null;
  nextRunAt: Date | null = null;

  private deps: SchedulerDeps;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  get running() {
    return this.current !== null;
  }

  start() {
    if (this.timer) return;
    const interval = this.deps.intervalMs ?? REFRESH_EVERY_MS;
    this.timer = setInterval(() => void this.runNow(), interval);
    this.nextRunAt = new Date(this.deps.now().getTime() + interval);
    void this.runNow();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }

  runNow(): Promise<RefreshRun> {
    if (this.current) return this.current;
    const { db, fetcher, now } = this.deps;
    this.current = (async () => {
      const startedAt = now().toISOString();
      try {
        const results = await refreshAllFeeds(db, { fetcher, now });
        archiveStale(db, now());
        const run = { startedAt, finishedAt: now().toISOString(), results };
        this.lastRun = run;
        this.deps.afterRun?.();
        return run;
      } finally {
        this.current = null;
        if (this.timer) {
          this.nextRunAt = new Date(now().getTime() + (this.deps.intervalMs ?? REFRESH_EVERY_MS));
        }
      }
    })();
    return this.current;
  }

  status() {
    return {
      running: this.running,
      lastRunAt: this.lastRun?.finishedAt ?? null,
      nextRunAt: this.nextRunAt?.toISOString() ?? null,
    };
  }
}
