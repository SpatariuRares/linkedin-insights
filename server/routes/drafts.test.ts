// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { openDb } from '../db.ts';
import { addFeed, insertArticles } from '../store/feeds.ts';
import { createProfile } from '../store/profiles.ts';
import { fakeFetch, fixture } from '../test-fetch.ts';
import type { GenerateFn } from '../agent/run.ts';
import { LlmError } from '../llm/types.ts';

const OUTPUT = {
  variants: [
    { angle: 'personale', text: 'Prima variante del post, abbastanza lunga da essere valida.' },
    { angle: 'informativo', text: 'Seconda variante del post, abbastanza lunga da essere valida.' },
  ],
  hooks: ['Hook numero uno', 'Hook numero due', 'Hook numero tre'],
};

function setup(generate: GenerateFn, { withProfile = true } = {}) {
  const db = openDb(':memory:');
  const feed = addFeed(db, { url: 'https://blog.example.com/feed.xml', title: 'Blog' }, new Date());
  const item = (url: string) => ({
    guid: null,
    url,
    title: `Titolo ${url}`,
    snippet: 'Riassunto.',
    author: null,
    publishedAt: null,
  });
  insertArticles(
    db,
    feed,
    [item('https://blog.example.com/a'), item('https://blog.example.com/b')],
    new Date(),
  );
  if (withProfile) {
    createProfile(
      db,
      {
        name: 'Test',
        kind: 'openai-compatible',
        baseUrl: 'https://x',
        model: 'm',
        apiKeyEnv: null,
      },
      new Date(),
    );
  }
  const { fetcher } = fakeFetch({
    'https://blog.example.com/a': { body: fixture('article.html') },
    'https://blog.example.com/b': { status: 403, body: 'paywall' },
  });
  const app = createApp({ db, fetcher, generate, now: () => new Date('2026-10-07T10:00:00Z') });
  const json = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { app, json };
}

describe('drafts API', () => {
  it('reads the sources, asks the model and stores draft, sources and version 1', async () => {
    const generate = vi.fn<GenerateFn>().mockResolvedValue({
      text: JSON.stringify(OUTPUT),
      model: 'anthropic/claude-sonnet-5.5',
      usage: { inputTokens: 1200, outputTokens: 400 },
    });
    const { json, app } = setup(generate);
    const res = await json('POST', '/api/drafts', { articleIds: [1, 2], thought: 'Il mio angolo' });
    expect(res.status).toBe(201);
    const draft = await res.json();

    expect(draft).toMatchObject({
      thought: 'Il mio angolo',
      profileName: 'Test',
      text: OUTPUT.variants[0].text,
      calendarEntryId: null,
    });
    expect(draft.sources.map((s: { fullText: boolean }) => s.fullText)).toEqual([true, false]);
    expect(draft.versions).toHaveLength(1);
    expect(draft.versions[0]).toMatchObject({
      n: 1,
      variants: OUTPUT.variants,
      hooks: OUTPUT.hooks,
      model: 'anthropic/claude-sonnet-5.5',
      usage: { inputTokens: 1200, outputTokens: 400 },
    });

    const prompt = generate.mock.calls[0][1].prompt;
    expect(prompt).toContain('codemod ufficiale'); // full article text, not the snippet
    expect(prompt).toContain('Il mio angolo');

    expect(await (await app.request(`/api/drafts/${draft.id}`)).json()).toEqual(draft);
  });

  it('asks to configure a model when there is none', async () => {
    const { json } = setup(vi.fn(), { withProfile: false });
    const res = await json('POST', '/api/drafts', { articleIds: [1], thought: '' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Impostazioni → Modelli/);
  });

  it('reports a model failure without creating a draft', async () => {
    const { json, app } = setup(
      vi.fn<GenerateFn>().mockRejectedValue(new LlmError('Chiave API rifiutata')),
    );
    const res = await json('POST', '/api/drafts', { articleIds: [1], thought: '' });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Chiave API rifiutata');
    expect((await app.request('/api/drafts/1')).status).toBe(404);
  });

  it('saves the edited text', async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockResolvedValue({ text: JSON.stringify(OUTPUT), model: 'm', usage: null });
    const { json, app } = setup(generate);
    const draft = await (
      await json('POST', '/api/drafts', { articleIds: [1], thought: '' })
    ).json();
    await json('PATCH', `/api/drafts/${draft.id}`, { text: 'Testo modificato a mano' });
    expect((await (await app.request(`/api/drafts/${draft.id}`)).json()).text).toBe(
      'Testo modificato a mano',
    );
  });
});

describe('POST /api/drafts/:id/revise', () => {
  const REVISED = {
    variants: [
      { angle: 'fedele', text: 'Versione più corta del post, ma ancora completa e sensata.' },
      {
        angle: 'decisa',
        text: 'Versione molto più corta del post, ridotta al minimo indispensabile.',
      },
    ],
    hooks: ['Nuovo hook uno', 'Nuovo hook due', 'Nuovo hook tre'],
  };

  it('revises from the editor text, adds a numbered version and keeps the earlier ones', async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockResolvedValueOnce({ text: JSON.stringify(OUTPUT), model: 'm', usage: null })
      .mockResolvedValueOnce({ text: JSON.stringify(REVISED), model: 'm', usage: null });
    const { json } = setup(generate);
    const draft = await (
      await json('POST', '/api/drafts', { articleIds: [1], thought: 'Angolo' })
    ).json();

    const res = await json('POST', `/api/drafts/${draft.id}/revise`, {
      instruction: 'più corto',
      text: 'Testo che ho ritoccato a mano',
    });
    expect(res.status).toBe(200);
    const revised = await res.json();

    const prompt = generate.mock.calls[1][1].prompt;
    expect(prompt).toContain('<testo_attuale>\nTesto che ho ritoccato a mano\n</testo_attuale>');
    expect(prompt).toContain('<richiesta>\npiù corto\n</richiesta>');
    expect(prompt).toContain('codemod ufficiale'); // sources still available
    expect(prompt).not.toContain('Scrivi le 2 varianti e i 3 hook.');

    expect(
      revised.versions.map((v: { n: number; instruction: string | null }) => [v.n, v.instruction]),
    ).toEqual([
      [1, null],
      [2, 'più corto'],
    ]);
    expect(revised.versions[0].variants).toEqual(OUTPUT.variants);
    expect(revised.text).toBe(REVISED.variants[0].text);
  });

  it('keeps the hand-edited text when the model fails', async () => {
    const generate = vi
      .fn<GenerateFn>()
      .mockResolvedValueOnce({ text: JSON.stringify(OUTPUT), model: 'm', usage: null })
      .mockRejectedValueOnce(new LlmError('Timeout'));
    const { json, app } = setup(generate);
    const draft = await (
      await json('POST', '/api/drafts', { articleIds: [1], thought: '' })
    ).json();
    const res = await json('POST', `/api/drafts/${draft.id}/revise`, {
      instruction: 'più corto',
      text: 'Mio testo',
    });
    expect(res.status).toBe(502);
    const after = await (await app.request(`/api/drafts/${draft.id}`)).json();
    expect(after.text).toBe('Mio testo');
    expect(after.versions).toHaveLength(1);
  });
});

describe('POST /api/drafts/:id/save', () => {
  async function created() {
    const generate = vi
      .fn<GenerateFn>()
      .mockResolvedValue({ text: JSON.stringify(OUTPUT), model: 'm', usage: null });
    const ctx = setup(generate);
    const draft = await (
      await ctx.json('POST', '/api/drafts', { articleIds: [1, 2], thought: '' })
    ).json();
    return { ...ctx, draft };
  }

  it('creates a "bozza" calendar entry titled after the first line, linked to the draft', async () => {
    const { json, app, draft } = await created();
    const res = await json('POST', `/api/drafts/${draft.id}/save`, {
      text: '\nLa prima riga diventa il titolo\n\nCorpo del post.',
      pillarId: 'p1',
      day: '2026-10-13',
    });
    const saved = await res.json();
    expect(saved.calendarEntryId).toBeTruthy();

    const { calendar } = await (await app.request('/api/state')).json();
    expect(calendar.entries).toEqual([
      {
        id: saved.calendarEntryId,
        day: '2026-10-13',
        title: 'La prima riga diventa il titolo',
        notes: '\nLa prima riga diventa il titolo\n\nCorpo del post.',
        format: 'testo',
        pillarId: 'p1',
        status: 'bozza',
        postUrl: null,
        draftId: draft.id,
      },
    ]);
  });

  it('updates the same entry on a second save, keeping the day the user chose', async () => {
    const { json, app, draft } = await created();
    const first = await (
      await json('POST', `/api/drafts/${draft.id}/save`, { pillarId: null, day: '2026-10-13' })
    ).json();
    // the user moves it in the calendar
    const state = await (await app.request('/api/state')).json();
    state.calendar.entries[0].day = '2026-10-20';
    await json('PUT', '/api/state/calendar', state.calendar);

    await json('PATCH', `/api/drafts/${draft.id}`, { text: 'Titolo nuovo\ncorpo' });
    const second = await (
      await json('POST', `/api/drafts/${draft.id}/save`, { pillarId: 'p2' })
    ).json();
    expect(second.calendarEntryId).toBe(first.calendarEntryId);

    const { calendar } = await (await app.request('/api/state')).json();
    expect(calendar.entries).toHaveLength(1);
    expect(calendar.entries[0]).toMatchObject({
      day: '2026-10-20',
      title: 'Titolo nuovo',
      pillarId: 'p2',
    });
  });

  it('creates a new entry if the old one was deleted from the calendar', async () => {
    const { json, app, draft } = await created();
    const first = await (await json('POST', `/api/drafts/${draft.id}/save`, {})).json();
    const state = await (await app.request('/api/state')).json();
    await json('PUT', '/api/state/calendar', { ...state.calendar, entries: [] });
    const second = await (await json('POST', `/api/drafts/${draft.id}/save`, {})).json();
    expect(second.calendarEntryId).not.toBe(first.calendarEntryId);
    expect((await (await app.request('/api/state')).json()).calendar.entries).toHaveLength(1);
  });
});
