import { z } from 'zod';
import { emptyHistory, type History } from './history';
import { defaultCalendar, type CalendarState } from './calendar';

export type GoalSettings = { target: number; targetDay: string | null };

export type AppState = {
  version: 1;
  history: History;
  goal: GoalSettings;
  calendar: CalendarState;
};

const STORAGE_KEY = 'linkedin-dashboard:v1';

export function defaultState(): AppState {
  return {
    version: 1,
    history: emptyHistory(),
    goal: { target: 5000, targetDay: null },
    calendar: defaultCalendar(),
  };
}

const num = z.number();
const nullableNum = z.number().nullable();
const appStateSchema = z.object({
  version: z.literal(1),
  history: z.object({
    engagement: z.array(z.object({ date: z.string(), impressions: num, engagements: num })),
    followers: z.array(z.object({ date: z.string(), newFollowers: num })),
    followerTotals: z.array(z.object({ day: z.string(), total: num })),
    posts: z.array(
      z.object({
        url: z.string(),
        day: z.string(),
        engagements: nullableNum,
        impressions: nullableNum,
      }),
    ),
    demographics: z.array(z.object({ category: z.string(), value: z.string(), percentage: num })),
    imports: z.array(
      z.object({
        fileName: z.string(),
        importedAt: z.string(),
        rangeLabel: z.string().nullable(),
        firstDay: z.string().nullable(),
        lastDay: z.string().nullable(),
        impressions: nullableNum,
        membersReached: nullableNum,
      }),
    ),
  }),
  goal: z.object({ target: num, targetDay: z.string().nullable() }),
  calendar: z.object({
    postsPerWeek: num,
    pillars: z.array(z.object({ id: z.string(), name: z.string(), slot: num })),
    entries: z.array(
      z.object({
        id: z.string(),
        day: z.string().nullable(),
        title: z.string(),
        notes: z.string(),
        format: z.enum(['testo', 'immagine', 'carosello', 'video', 'sondaggio', 'articolo']),
        pillarId: z.string().nullable(),
        status: z.enum(['idea', 'bozza', 'programmato', 'pubblicato']),
        postUrl: z.string().nullable(),
      }),
    ),
  }),
});

export function parseState(raw: string): AppState {
  return appStateSchema.parse(JSON.parse(raw));
}

/** Storage can be unavailable (private mode, blocked site data): the app then runs in-memory only. */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseState(raw) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function downloadBackup(state: AppState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linkedin-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
