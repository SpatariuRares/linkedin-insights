import type { DB } from '../db.ts';
import type { Fetcher } from '../http.ts';
import { getCalendar } from '../store/state.ts';
import { getVoice } from '../store/voice.ts';
import { rizzoOnline, scoreArticle } from './rizzo.ts';

export const RIZZO_URL = process.env.RIZZO_URL ?? 'http://127.0.0.1:8017';
export const CHECK_EVERY_MS = 2 * 60_000;

type Deps = { db: DB; fetcher: Fetcher; now: () => Date; baseUrl?: string; intervalMs?: number };

type Pending = { id: number; title: string; snippet: string; source: string };

/** Articles still worth triaging: in the inbox or saved, and never scored. */
export function pendingArticles(db: DB, limit = 1000): Pending[] {
  return db
    .prepare(
      `SELECT a.id, a.title, a.snippet, a.source_title AS source FROM articles a
       LEFT JOIN article_scores s ON s.article_id = a.id
       WHERE s.article_id IS NULL AND a.state IN ('inbox', 'saved')
       ORDER BY a.published_at DESC LIMIT ?`,
    )
    .all(limit) as Pending[];
}

/**
 * Scores the backlog whenever Rizzo Flow is reachable. It checks every couple of minutes, so
 * starting Rizzo Flow later is enough for the articles that arrived meanwhile to get scored.
 */
export class TriageRunner {
  private deps: Deps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: Promise<number> | null = null;
  online = false;
  lastRunAt: string | null = null;
  lastError: string | null = null;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  get baseUrl() {
    return this.deps.baseUrl ?? RIZZO_URL;
  }

  get running() {
    return this.current !== null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runNow(), this.deps.intervalMs ?? CHECK_EVERY_MS);
    void this.runNow();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async checkOnline() {
    this.online = await rizzoOnline(this.baseUrl, this.deps.fetcher);
    return this.online;
  }

  /** Scores pending articles one at a time; returns how many were scored. */
  runNow(): Promise<number> {
    if (this.current) return this.current;
    this.current = (async () => {
      try {
        if (!(await this.checkOnline())) return 0;
        const { db, fetcher, now } = this.deps;
        const voice = getVoice(db);
        const pillars = getCalendar(db).pillars.map((p) => ({ id: p.id, name: p.name }));
        const profile = [voice.about, voice.audience && `Scrive per: ${voice.audience}`]
          .filter(Boolean)
          .join(' ');
        const insert = db.prepare(
          `INSERT OR REPLACE INTO article_scores
             (article_id, pillar_id, pillar_prob, relevance, post_worthy, post_worthy_prob, raw, model, scored_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        let scored = 0;
        for (const article of pendingArticles(db)) {
          const { score, raw } = await scoreArticle(this.baseUrl, fetcher, {
            profile,
            pillars,
            article,
          });
          insert.run(
            article.id,
            score.pillarId,
            score.pillarProb,
            score.relevance,
            score.postWorthy === null ? null : score.postWorthy ? 1 : 0,
            score.postWorthyProb,
            JSON.stringify(raw),
            score.model,
            now().toISOString(),
          );
          scored++;
        }
        this.lastError = null;
        return scored;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        return 0;
      } finally {
        this.lastRunAt = this.deps.now().toISOString();
        this.current = null;
      }
    })();
    return this.current;
  }

  status() {
    return {
      online: this.online,
      running: this.running,
      pending: pendingArticles(this.deps.db).length,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      url: this.baseUrl,
    };
  }
}
