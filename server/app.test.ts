// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { testApp } from './test-utils.ts';
import { defaultState } from '../src/lib/storage';
import type { LinkedInExport } from '../src/lib/linkedin-export';

function exportOf(partial: Partial<LinkedInExport>): LinkedInExport {
  return {
    rangeLabel: null,
    impressions: null,
    membersReached: null,
    totalFollowers: null,
    totalFollowersAsOf: null,
    engagement: [],
    followers: [],
    topByEngagement: [],
    topByImpressions: [],
    demographics: [],
    ...partial,
  };
}

describe('GET /api/health', () => {
  it('answers ok', async () => {
    const res = await testApp().app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 404 outside /api', async () => {
    expect((await testApp().app.request('/health')).status).toBe(404);
  });
});

describe('state API', () => {
  it('serves the default state on a fresh database', async () => {
    const res = await testApp().app.request('/api/state');
    expect(await res.json()).toEqual(defaultState());
  });

  it('saves the goal', async () => {
    const { app, json } = testApp();
    await json('PUT', '/api/state/goal', { target: 6000, targetDay: '2027-03-31' });
    const state = await (await app.request('/api/state')).json();
    expect(state.goal).toEqual({ target: 6000, targetDay: '2027-03-31' });
  });

  it('rejects an invalid body with 400', async () => {
    const { json } = testApp();
    expect((await json('PUT', '/api/state/goal', { target: 'tanti' })).status).toBe(400);
  });

  it('saves the calendar keeping entry order and dropping removed rows', async () => {
    const { app, json } = testApp();
    const entry = (id: string, title: string) => ({
      id,
      day: '2026-10-13',
      title,
      notes: '',
      format: 'testo',
      pillarId: 'p1',
      status: 'programmato',
      postUrl: null,
    });
    const calendar = {
      postsPerWeek: 4,
      pillars: [{ id: 'p1', name: 'Competenze', slot: 1 }],
      entries: [entry('b', 'Secondo'), entry('a', 'Primo')],
    };
    await json('PUT', '/api/state/calendar', calendar);
    await json('PUT', '/api/state/calendar', { ...calendar, entries: [calendar.entries[0]] });

    const state = await (await app.request('/api/state')).json();
    expect(state.calendar.postsPerWeek).toBe(4);
    expect(state.calendar.pillars).toEqual([{ id: 'p1', name: 'Competenze', slot: 1 }]);
    expect(state.calendar.entries.map((e: { id: string }) => e.id)).toEqual(['b']);
  });

  it('merges successive exports into the stored history', async () => {
    const { json } = testApp();
    await json('POST', '/api/history/import', {
      fileName: 'a.xlsx',
      data: exportOf({
        totalFollowers: 1000,
        totalFollowersAsOf: '2026-10-01T00:00:00',
        engagement: [{ date: '2026-10-01T00:00:00', impressions: 10, engagements: 1 }],
        topByImpressions: [{ url: 'u1', date: '2026-09-30T00:00:00', value: 500 }],
      }),
    });
    const res = await json('POST', '/api/history/import', {
      fileName: 'b.xlsx',
      data: exportOf({
        engagement: [
          { date: '2026-10-01T00:00:00', impressions: 12, engagements: 2 },
          { date: '2026-10-02T00:00:00', impressions: 20, engagements: 3 },
        ],
      }),
    });
    const history = await res.json();
    expect(history.engagement).toEqual([
      { date: '2026-10-01T00:00:00', impressions: 12, engagements: 2 },
      { date: '2026-10-02T00:00:00', impressions: 20, engagements: 3 },
    ]);
    expect(history.followerTotals).toEqual([{ day: '2026-10-01', total: 1000 }]);
    expect(history.posts).toEqual([
      { url: 'u1', day: '2026-09-30', engagements: null, impressions: 500 },
    ]);
    expect(history.imports.map((i: { fileName: string }) => i.fileName)).toEqual([
      'a.xlsx',
      'b.xlsx',
    ]);
    expect(history.imports[0].importedAt).toBe('2026-10-07T10:00:00.000Z');
  });

  it('replaces and resets the whole state', async () => {
    const { app, json } = testApp();
    const custom = defaultState();
    custom.goal = { target: 7000, targetDay: null };
    custom.calendar.postsPerWeek = 5;
    await json('PUT', '/api/state', custom);
    expect(await (await app.request('/api/state')).json()).toEqual(custom);

    await json('DELETE', '/api/state');
    expect(await (await app.request('/api/state')).json()).toEqual(defaultState());
  });
});

describe('POST /api/migrate', () => {
  function browserState() {
    const state = defaultState();
    state.goal = { target: 5000, targetDay: '2027-03-31' };
    state.calendar.entries = [
      {
        id: 'e1',
        day: '2026-10-13',
        title: 'Primo post',
        notes: '',
        format: 'testo',
        pillarId: 'p1',
        status: 'programmato',
        postUrl: null,
      },
    ];
    state.history.followerTotals = [{ day: '2026-10-05', total: 1840 }];
    state.history.imports = [
      {
        fileName: 'a.xlsx',
        importedAt: '2026-10-06T08:00:00.000Z',
        rangeLabel: null,
        firstDay: '2025-10-06',
        lastDay: '2026-10-05',
        impressions: 1000,
        membersReached: 300,
      },
    ];
    return state;
  }

  it('moves the browser state into an empty database', async () => {
    const { app, json } = testApp();
    const res = await json('POST', '/api/migrate', browserState());
    expect(res.status).toBe(200);
    expect(await (await app.request('/api/state')).json()).toEqual(browserState());
  });

  it('refuses with 409 once the database has user data, leaving it untouched', async () => {
    const { app, json } = testApp();
    await json('POST', '/api/migrate', browserState());
    const other = defaultState();
    other.goal = { target: 1, targetDay: null };
    const res = await json('POST', '/api/migrate', other);
    expect(res.status).toBe(409);
    expect((await (await app.request('/api/state')).json()).goal.target).toBe(5000);
  });

  it('round-trips a backup through PUT /api/state on an empty database', async () => {
    const source = testApp();
    await source.json('POST', '/api/migrate', browserState());
    const backup = await (await source.app.request('/api/state')).json();

    const target = testApp();
    await target.json('PUT', '/api/state', backup);
    expect(await (await target.app.request('/api/state')).json()).toEqual(backup);
  });
});
