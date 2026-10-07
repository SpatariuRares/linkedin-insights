import type { AppState } from './storage';

export const MIGRATED_KEY = 'linkedin-dashboard:migrated-to-server';

/** Worth sending to the server only if the user actually created something in the browser. */
export function hasBrowserData(state: AppState): boolean {
  return state.history.imports.length > 0 || state.calendar.entries.length > 0;
}

/**
 * Reads what the browser-only version of the app saved, unless it was already handed to the
 * server. Returns null when there is nothing to migrate.
 */
export function pendingBrowserState(
  storage: Pick<Storage, 'getItem'>,
  load: () => AppState,
): AppState | null {
  try {
    if (storage.getItem(MIGRATED_KEY)) return null;
  } catch {
    return null;
  }
  const state = load();
  return hasBrowserData(state) ? state : null;
}
