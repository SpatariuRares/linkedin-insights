import type { DB } from '../db.ts';
import type { DraftOutput } from '../agent/compose.ts';

export type DraftSource = {
  articleId: number;
  title: string;
  url: string;
  source: string;
  fullText: boolean | null;
};

export type DraftVersion = {
  id: number;
  n: number;
  variants: DraftOutput['variants'];
  hooks: string[];
  instruction: string | null;
  model: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  createdAt: string;
};

export type Draft = {
  id: number;
  thought: string;
  profileId: number | null;
  profileName: string | null;
  calendarEntryId: string | null;
  text: string;
  createdAt: string;
  updatedAt: string;
  sources: DraftSource[];
  versions: DraftVersion[];
};

export function createDraft(
  db: DB,
  input: { thought: string; profileId: number; articleIds: number[]; text: string },
  now: Date,
): number {
  return db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO drafts (thought, profile_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.thought, input.profileId, input.text, now.toISOString(), now.toISOString());
    const id = Number(info.lastInsertRowid);
    const src = db.prepare(
      'INSERT INTO draft_sources (draft_id, article_id, position) VALUES (?, ?, ?)',
    );
    input.articleIds.forEach((a, i) => src.run(id, a, i));
    return id;
  })();
}

export function addVersion(
  db: DB,
  draftId: number,
  v: {
    output: DraftOutput;
    instruction: string | null;
    model: string | null;
    usage: DraftVersion['usage'];
  },
  now: Date,
): number {
  const n =
    (
      db
        .prepare('SELECT coalesce(max(n), 0) AS n FROM draft_versions WHERE draft_id = ?')
        .get(draftId) as { n: number }
    ).n + 1;
  db.prepare(
    `INSERT INTO draft_versions (draft_id, n, variants, hooks, instruction, model, input_tokens, output_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    draftId,
    n,
    JSON.stringify(v.output.variants),
    JSON.stringify(v.output.hooks),
    v.instruction,
    v.model,
    v.usage.inputTokens,
    v.usage.outputTokens,
    now.toISOString(),
  );
  db.prepare('UPDATE drafts SET updated_at = ? WHERE id = ?').run(now.toISOString(), draftId);
  return n;
}

export function setDraftText(db: DB, id: number, text: string, now: Date) {
  db.prepare('UPDATE drafts SET text = ?, updated_at = ? WHERE id = ?').run(
    text,
    now.toISOString(),
    id,
  );
}

type VersionRow = {
  id: number;
  n: number;
  variants: string;
  hooks: string;
  instruction: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

export function getDraft(db: DB, id: number): Draft | null {
  const row = db
    .prepare(
      `SELECT d.id, d.thought, d.profile_id AS profileId, p.name AS profileName,
              d.calendar_entry_id AS calendarEntryId, d.text, d.created_at AS createdAt,
              d.updated_at AS updatedAt
       FROM drafts d LEFT JOIN profiles p ON p.id = d.profile_id WHERE d.id = ?`,
    )
    .get(id) as Omit<Draft, 'sources' | 'versions'> | undefined;
  if (!row) return null;

  const sources = (
    db
      .prepare(
        `SELECT a.id AS articleId, a.title, a.url, a.source_title AS source, a.full_text_ok AS fullText
         FROM draft_sources s JOIN articles a ON a.id = s.article_id
         WHERE s.draft_id = ? ORDER BY s.position`,
      )
      .all(id) as (Omit<DraftSource, 'fullText'> & { fullText: number | null })[]
  ).map((s) => ({ ...s, fullText: s.fullText === null ? null : s.fullText === 1 }));

  const versions = (
    db.prepare('SELECT * FROM draft_versions WHERE draft_id = ? ORDER BY n').all(id) as VersionRow[]
  ).map((v) => ({
    id: v.id,
    n: v.n,
    variants: JSON.parse(v.variants),
    hooks: JSON.parse(v.hooks),
    instruction: v.instruction,
    model: v.model,
    usage: { inputTokens: v.input_tokens, outputTokens: v.output_tokens },
    createdAt: v.created_at,
  }));

  return { ...row, sources, versions };
}

/** The post's first non-empty line, as the calendar title. */
export function titleFromText(text: string): string {
  const line =
    text
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? 'Bozza senza titolo';
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

/**
 * Creates the calendar entry for a draft, or updates the one it already has (even if the user
 * moved it to another day: the day is only set when given).
 */
export function saveDraftToCalendar(
  db: DB,
  draftId: number,
  opts: { pillarId: string | null; day?: string | null },
  now: Date,
): string {
  return db.transaction(() => {
    const draft = db
      .prepare('SELECT text, calendar_entry_id FROM drafts WHERE id = ?')
      .get(draftId) as { text: string; calendar_entry_id: string | null };
    const existing = draft.calendar_entry_id
      ? (db.prepare('SELECT id FROM calendar_entries WHERE id = ?').get(draft.calendar_entry_id) as
          { id: string } | undefined)
      : undefined;
    const title = titleFromText(draft.text);

    if (existing) {
      db.prepare(
        'UPDATE calendar_entries SET title = ?, notes = ?, pillar_id = ? WHERE id = ?',
      ).run(title, draft.text, opts.pillarId, existing.id);
      if (opts.day !== undefined) {
        db.prepare('UPDATE calendar_entries SET day = ? WHERE id = ?').run(opts.day, existing.id);
      }
      return existing.id;
    }

    const id = `draft-${draftId}-${crypto.randomUUID().slice(0, 8)}`;
    const position = (
      db.prepare('SELECT coalesce(max(position), -1) + 1 AS p FROM calendar_entries').get() as {
        p: number;
      }
    ).p;
    db.prepare(
      `INSERT INTO calendar_entries (id, day, title, notes, format, pillar_id, status, post_url, position)
       VALUES (?, ?, ?, ?, 'testo', ?, 'bozza', NULL, ?)`,
    ).run(id, opts.day ?? null, title, draft.text, opts.pillarId, position);
    db.prepare('UPDATE drafts SET calendar_entry_id = ?, updated_at = ? WHERE id = ?').run(
      id,
      now.toISOString(),
      draftId,
    );
    return id;
  })();
}
