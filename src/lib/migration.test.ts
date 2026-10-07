import { describe, expect, it } from 'vitest';
import { MIGRATED_KEY, pendingBrowserState } from './migration';
import { defaultState } from './storage';

const storage = (items: Record<string, string>) => ({ getItem: (k: string) => items[k] ?? null });

describe('pendingBrowserState', () => {
  const withEntry = () => {
    const s = defaultState();
    s.calendar.entries = [
      {
        id: 'e1',
        day: null,
        title: 'Idea',
        notes: '',
        format: 'testo',
        pillarId: null,
        status: 'idea',
        postUrl: null,
      },
    ];
    return s;
  };

  it('returns the browser state when it holds user data', () => {
    expect(pendingBrowserState(storage({}), withEntry)).toEqual(withEntry());
  });

  it('skips untouched defaults', () => {
    expect(pendingBrowserState(storage({}), defaultState)).toBeNull();
  });

  it('skips once already migrated', () => {
    expect(pendingBrowserState(storage({ [MIGRATED_KEY]: '1' }), withEntry)).toBeNull();
  });
});
