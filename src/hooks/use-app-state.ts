import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { loadState, type AppState, type GoalSettings } from '../lib/storage';
import { MIGRATED_KEY, pendingBrowserState } from '../lib/migration';
import type { CalendarState } from '../lib/calendar';
import type { LinkedInExport } from '../lib/linkedin-export';

/**
 * App state lives on the local server. Edits apply optimistically and are sent in order per slice
 * (goal, calendar), so a burst of keystrokes can't land on the server out of order.
 */
export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const queues = useRef(new Map<string, Promise<unknown>>());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setState(await api.getState());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return;
    }
    await migrateFromBrowser(setState);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enqueue = useCallback((key: string, send: () => Promise<unknown>) => {
    const prev = queues.current.get(key) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(send)
      .then(
        () => setSaveError(false),
        (err) => {
          setSaveError(true);
          toast.error(err instanceof Error ? err.message : 'Salvataggio non riuscito.');
        },
      );
    queues.current.set(key, next);
  }, []);

  const setGoal = useCallback(
    (goal: GoalSettings) => {
      setState((s) => (s ? { ...s, goal } : s));
      enqueue('goal', () => api.putGoal(goal));
    },
    [enqueue],
  );

  const setCalendar = useCallback(
    (calendar: CalendarState) => {
      setState((s) => (s ? { ...s, calendar } : s));
      enqueue('calendar', () => api.putCalendar(calendar));
    },
    [enqueue],
  );

  const importExport = useCallback(async (fileName: string, data: LinkedInExport) => {
    const history = await api.importExport(fileName, data);
    setState((s) => (s ? { ...s, history } : s));
  }, []);

  const replace = useCallback(async (next: AppState) => {
    setState(await api.putState(next));
  }, []);

  const reset = useCallback(async () => {
    setState(await api.resetState());
  }, []);

  return {
    state,
    loadError,
    saveError,
    reload: load,
    setGoal,
    setCalendar,
    importExport,
    replace,
    reset,
  };
}

function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  } catch {
    /* storage unavailable: we'll try again next time and get a harmless 409 */
  }
}

/**
 * The browser-only version kept everything in localStorage. On the first run against the server,
 * hand it over once; the server refuses (409) if it already has data, so nothing is overwritten.
 */
let migrationStarted = false;

async function migrateFromBrowser(setState: (s: AppState) => void) {
  // StrictMode mounts effects twice in development: the second run would only collect a 409.
  if (migrationStarted) return;
  migrationStarted = true;
  const browser = pendingBrowserState(localStorage, loadState);
  if (!browser) return;
  try {
    setState(await api.migrate(browser));
    markMigrated();
    toast.success('Dati del browser spostati nel database locale.');
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) markMigrated();
    else toast.error('Migrazione dei dati del browser non riuscita: riproverò al prossimo avvio.');
  }
}
