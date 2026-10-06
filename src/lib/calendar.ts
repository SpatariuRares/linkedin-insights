import { addDays, weekStart } from './dates';
import type { TrackedPost } from './history';

export const POST_FORMATS = [
  { id: 'testo', label: 'Testo' },
  { id: 'immagine', label: 'Immagine' },
  { id: 'carosello', label: 'Carosello' },
  { id: 'video', label: 'Video' },
  { id: 'sondaggio', label: 'Sondaggio' },
  { id: 'articolo', label: 'Articolo' },
] as const;
export type PostFormat = (typeof POST_FORMATS)[number]['id'];

export const POST_STATUSES = [
  { id: 'idea', label: 'Idea' },
  { id: 'bozza', label: 'Bozza' },
  { id: 'programmato', label: 'Programmato' },
  { id: 'pubblicato', label: 'Pubblicato' },
] as const;
export type PostStatus = (typeof POST_STATUSES)[number]['id'];

/** A content pillar owns one categorical slot for life, so renaming or deleting others never repaints it. */
export type Pillar = { id: string; name: string; slot: number };

export type CalendarEntry = {
  id: string;
  day: string | null;
  title: string;
  notes: string;
  format: PostFormat;
  pillarId: string | null;
  status: PostStatus;
  postUrl: string | null;
};

export type CalendarState = { entries: CalendarEntry[]; pillars: Pillar[]; postsPerWeek: number };

export const MAX_PILLARS = 8;

export function defaultCalendar(): CalendarState {
  return {
    postsPerWeek: 3,
    entries: [],
    pillars: [
      { id: 'p1', name: 'Competenze', slot: 1 },
      { id: 'p2', name: 'Storie personali', slot: 2 },
      { id: 'p3', name: 'Opinioni', slot: 3 },
    ],
  };
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** First free slot (1..8) so a new pillar never shares a color with an existing one. */
export function nextPillarSlot(pillars: Pillar[]): number | null {
  const used = new Set(pillars.map((p) => p.slot));
  for (let s = 1; s <= MAX_PILLARS; s++) if (!used.has(s)) return s;
  return null;
}

/** Monday-first weeks covering the whole month, padded with the neighbouring months' days. */
export function monthGrid(year: number, month: number): string[][] {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDate = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
  const weeks: string[][] = [];
  for (let start = weekStart(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

export function entriesByDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    if (!e.day) continue;
    const list = map.get(e.day) ?? [];
    list.push(e);
    map.set(e.day, list);
  }
  return map;
}

/** Posts that will actually go out (or did): ideas and drafts don't count toward the weekly cadence. */
export function countsTowardCadence(e: CalendarEntry): boolean {
  return e.status === 'programmato' || e.status === 'pubblicato';
}

/**
 * LinkedIn post URLs come in several shapes (/posts/<slug>-share-<id>, /feed/update/urn:li:activity:<id>,
 * ...), but all carry the same 19-digit id, which is what we match on.
 */
export function postIdFromUrl(url: string): string | null {
  const ids = url.match(/\d{19}/g);
  return ids ? ids.at(-1)! : null;
}

export function findPostStats(entry: CalendarEntry, posts: TrackedPost[]): TrackedPost | null {
  if (!entry.postUrl) return null;
  const id = postIdFromUrl(entry.postUrl);
  if (!id) return posts.find((p) => p.url === entry.postUrl) ?? null;
  return posts.find((p) => postIdFromUrl(p.url) === id) ?? null;
}
