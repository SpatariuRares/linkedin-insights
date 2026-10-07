import type { DB } from '../db.ts';
import type { AppState, GoalSettings } from '../../src/lib/storage';
import type { CalendarEntry, CalendarState, Pillar } from '../../src/lib/calendar';
import type { History } from '../../src/lib/history';

/** Daily series are stored by day; the app works with local-midnight ISO strings. */
const toIso = (day: string) => `${day}T00:00:00`;
const toDay = (iso: string) => iso.slice(0, 10);

function getSetting<T>(db: DB, key: string): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  if (!row) throw new Error(`Impostazione mancante: ${key}`);
  return JSON.parse(row.value) as T;
}

function setSetting(db: DB, key: string, value: unknown) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
}

export function getGoal(db: DB): GoalSettings {
  return {
    target: getSetting<number>(db, 'goal_target'),
    targetDay: getSetting<string | null>(db, 'goal_target_day'),
  };
}

export function setGoal(db: DB, goal: GoalSettings) {
  db.transaction(() => {
    setSetting(db, 'goal_target', goal.target);
    setSetting(db, 'goal_target_day', goal.targetDay);
  })();
}

type EntryRow = {
  id: string;
  day: string | null;
  title: string;
  notes: string;
  format: CalendarEntry['format'];
  pillar_id: string | null;
  status: CalendarEntry['status'];
  post_url: string | null;
  draft_id: number | null;
};

export function getCalendar(db: DB): CalendarState {
  const pillars = db
    .prepare('SELECT id, name, slot FROM pillars ORDER BY position')
    .all() as Pillar[];
  const entries = (
    db
      .prepare(
        `SELECT e.id, e.day, e.title, e.notes, e.format, e.pillar_id, e.status, e.post_url,
                (SELECT d.id FROM drafts d WHERE d.calendar_entry_id = e.id ORDER BY d.id DESC LIMIT 1) AS draft_id
         FROM calendar_entries e ORDER BY e.position`,
      )
      .all() as EntryRow[]
  ).map((r) => ({
    id: r.id,
    day: r.day,
    title: r.title,
    notes: r.notes,
    format: r.format,
    pillarId: r.pillar_id,
    status: r.status,
    postUrl: r.post_url,
    ...(r.draft_id !== null ? { draftId: r.draft_id } : {}),
  }));
  return { postsPerWeek: getSetting<number>(db, 'posts_per_week'), pillars, entries };
}

/**
 * Replaces the calendar with `calendar`. Rows are upserted by id and only the missing ones are
 * deleted, so later tables can reference an entry and keep pointing at it across saves.
 */
export function setCalendar(db: DB, calendar: CalendarState) {
  db.transaction(() => {
    setSetting(db, 'posts_per_week', calendar.postsPerWeek);

    const pillarIds = calendar.pillars.map((p) => p.id);
    db.prepare(`DELETE FROM pillars WHERE id NOT IN (SELECT value FROM json_each(?))`).run(
      JSON.stringify(pillarIds),
    );
    const upsertPillar = db.prepare(
      `INSERT INTO pillars (id, name, slot, position) VALUES (@id, @name, @slot, @position)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, slot = excluded.slot, position = excluded.position`,
    );
    calendar.pillars.forEach((p, position) => upsertPillar.run({ ...p, position }));

    const entryIds = calendar.entries.map((e) => e.id);
    db.prepare(`DELETE FROM calendar_entries WHERE id NOT IN (SELECT value FROM json_each(?))`).run(
      JSON.stringify(entryIds),
    );
    const upsertEntry = db.prepare(
      `INSERT INTO calendar_entries (id, day, title, notes, format, pillar_id, status, post_url, position)
       VALUES (@id, @day, @title, @notes, @format, @pillarId, @status, @postUrl, @position)
       ON CONFLICT(id) DO UPDATE SET day = excluded.day, title = excluded.title, notes = excluded.notes,
         format = excluded.format, pillar_id = excluded.pillar_id, status = excluded.status,
         post_url = excluded.post_url, position = excluded.position`,
    );
    calendar.entries.forEach((e, position) => upsertEntry.run({ ...e, position }));
  })();
}

export function getHistory(db: DB): History {
  return {
    engagement: (
      db
        .prepare('SELECT day, impressions, engagements FROM daily_engagement ORDER BY day')
        .all() as { day: string; impressions: number; engagements: number }[]
    ).map((r) => ({ date: toIso(r.day), impressions: r.impressions, engagements: r.engagements })),
    followers: (
      db.prepare('SELECT day, new_followers FROM daily_followers ORDER BY day').all() as {
        day: string;
        new_followers: number;
      }[]
    ).map((r) => ({ date: toIso(r.day), newFollowers: r.new_followers })),
    followerTotals: db
      .prepare('SELECT day, total FROM follower_totals ORDER BY day')
      .all() as History['followerTotals'],
    posts: db
      .prepare(
        'SELECT url, day, engagements, impressions FROM tracked_posts ORDER BY day DESC, url',
      )
      .all() as History['posts'],
    demographics: db
      .prepare('SELECT category, value, percentage FROM demographics ORDER BY position')
      .all() as History['demographics'],
    imports: db
      .prepare(
        `SELECT file_name AS fileName, imported_at AS importedAt, range_label AS rangeLabel,
                first_day AS firstDay, last_day AS lastDay, impressions, members_reached AS membersReached
         FROM imports ORDER BY id`,
      )
      .all() as History['imports'],
  };
}

/** Writes a whole History. It is small (a few thousand rows at most), so a full rewrite is fine. */
export function setHistory(db: DB, history: History) {
  db.transaction(() => {
    for (const t of [
      'daily_engagement',
      'daily_followers',
      'follower_totals',
      'tracked_posts',
      'demographics',
      'imports',
    ]) {
      db.exec(`DELETE FROM ${t}`);
    }
    const eng = db.prepare(
      'INSERT INTO daily_engagement (day, impressions, engagements) VALUES (?, ?, ?)',
    );
    for (const p of history.engagement) eng.run(toDay(p.date), p.impressions, p.engagements);
    const fol = db.prepare('INSERT INTO daily_followers (day, new_followers) VALUES (?, ?)');
    for (const p of history.followers) fol.run(toDay(p.date), p.newFollowers);
    const tot = db.prepare('INSERT INTO follower_totals (day, total) VALUES (?, ?)');
    for (const t of history.followerTotals) tot.run(t.day, t.total);
    const post = db.prepare(
      'INSERT INTO tracked_posts (url, day, engagements, impressions) VALUES (?, ?, ?, ?)',
    );
    for (const p of history.posts) post.run(p.url, p.day, p.engagements, p.impressions);
    const demo = db.prepare(
      'INSERT INTO demographics (position, category, value, percentage) VALUES (?, ?, ?, ?)',
    );
    history.demographics.forEach((d, i) => demo.run(i, d.category, d.value, d.percentage));
    const imp = db.prepare(
      `INSERT INTO imports (file_name, imported_at, range_label, first_day, last_day, impressions, members_reached)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const i of history.imports) {
      imp.run(
        i.fileName,
        i.importedAt,
        i.rangeLabel,
        i.firstDay,
        i.lastDay,
        i.impressions,
        i.membersReached,
      );
    }
  })();
}

export function getState(db: DB): AppState {
  return { version: 1, history: getHistory(db), goal: getGoal(db), calendar: getCalendar(db) };
}

export function setState(db: DB, state: AppState) {
  db.transaction(() => {
    setGoal(db, state.goal);
    setCalendar(db, state.calendar);
    setHistory(db, state.history);
  })();
}

/**
 * True once the database holds anything the user created: an imported export or a calendar entry.
 * Untouched defaults (seeded pillars, goal 5000) don't count.
 */
export function hasUserData(db: DB): boolean {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return count('imports') > 0 || count('calendar_entries') > 0;
}
