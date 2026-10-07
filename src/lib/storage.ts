import { appStateSchema } from './schemas';
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
