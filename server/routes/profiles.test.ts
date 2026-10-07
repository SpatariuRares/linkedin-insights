// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { openDb } from '../db.ts';
import type { Fetcher } from '../http.ts';

const OPENROUTER = {
  name: 'OpenRouter – Sonnet',
  kind: 'openai-compatible',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-5.5',
  apiKeyEnv: 'OPENROUTER_API_KEY',
};

function setup(env: Record<string, string> = {}, fetcher?: Fetcher) {
  const requests: { url: string; init: RequestInit }[] = [];
  const defaultFetcher: Fetcher = async (input, init) => {
    requests.push({ url: String(input), init: init ?? {} });
    return Response.json({
      model: 'anthropic/claude-sonnet-5.5',
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 12, completion_tokens: 1 },
    });
  };
  const app = createApp({ db: openDb(':memory:'), fetcher: fetcher ?? defaultFetcher, env });
  const json = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { app, json, requests };
}

describe('profiles API', () => {
  it('creates profiles, makes the first one default and reports the key without exposing it', async () => {
    const { json, app } = setup({ OPENROUTER_API_KEY: 'sk-secret' });
    const first = await (await json('POST', '/api/profiles', OPENROUTER)).json();
    expect(first).toMatchObject({
      isDefault: true,
      keyPresent: true,
      apiKeyEnv: 'OPENROUTER_API_KEY',
    });
    const second = await (
      await json('POST', '/api/profiles', {
        ...OPENROUTER,
        name: 'Opus',
        model: 'anthropic/claude-opus-5.5',
      })
    ).json();
    expect(second.isDefault).toBe(false);

    await json('POST', `/api/profiles/${second.id}/default`);
    const list = await (await app.request('/api/profiles')).json();
    expect(list.map((p: { isDefault: boolean }) => p.isDefault)).toEqual([false, true]);
    expect(JSON.stringify(list)).not.toContain('sk-secret');
  });

  it('hands the default to the oldest profile when the default is deleted', async () => {
    const { json, app } = setup();
    const a = await (await json('POST', '/api/profiles', OPENROUTER)).json();
    await json('POST', '/api/profiles', { ...OPENROUTER, name: 'B' });
    await json('POST', '/api/profiles', { ...OPENROUTER, name: 'C' });
    await json('DELETE', `/api/profiles/${a.id}`);
    const list = await (await app.request('/api/profiles')).json();
    expect(list.find((p: { isDefault: boolean }) => p.isDefault).name).toBe('B');
  });

  it('rejects an HTTP profile without URL or model, or with a malformed key variable', async () => {
    const { json } = setup();
    expect((await json('POST', '/api/profiles', { ...OPENROUTER, baseUrl: null })).status).toBe(
      400,
    );
    expect((await json('POST', '/api/profiles', { ...OPENROUTER, model: '' })).status).toBe(400);
    const lower = await json('POST', '/api/profiles', { ...OPENROUTER, apiKeyEnv: 'sk-123' });
    expect(lower.status).toBe(400);
  });

  it('tests a profile with a real-shaped Chat Completions request', async () => {
    const { json, requests } = setup({ OPENROUTER_API_KEY: 'sk-secret' });
    const p = await (await json('POST', '/api/profiles', OPENROUTER)).json();
    const res = await (await json('POST', `/api/profiles/${p.id}/test`)).json();
    expect(res).toMatchObject({ ok: true, text: 'ok', model: 'anthropic/claude-sonnet-5.5' });

    expect(requests[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = requests[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-secret');
    const body = JSON.parse(String(requests[0].init.body));
    expect(body.model).toBe('anthropic/claude-sonnet-5.5');
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user']);
  });

  it('sends no Authorization header for a keyless local server', async () => {
    const { json, requests } = setup();
    const p = await (
      await json('POST', '/api/profiles', {
        ...OPENROUTER,
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKeyEnv: null,
      })
    ).json();
    expect((await (await json('POST', `/api/profiles/${p.id}/test`)).json()).ok).toBe(true);
    expect((requests[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('explains a missing key', async () => {
    const { json } = setup({});
    const p = await (await json('POST', '/api/profiles', OPENROUTER)).json();
    const res = await (await json('POST', `/api/profiles/${p.id}/test`)).json();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/OPENROUTER_API_KEY non è impostata/);
  });

  it('explains a rejected key', async () => {
    const fetcher: Fetcher = async () =>
      Response.json({ error: { message: 'No auth credentials found' } }, { status: 401 });
    const { json } = setup({ OPENROUTER_API_KEY: 'sk-wrong' }, fetcher);
    const p = await (await json('POST', '/api/profiles', OPENROUTER)).json();
    const res = await (await json('POST', `/api/profiles/${p.id}/test`)).json();
    expect(res).toMatchObject({ ok: false });
    expect(res.error).toMatch(/Chiave API rifiutata.*No auth credentials/);
  });

  it('lists the provider models', async () => {
    const fetcher: Fetcher = async () =>
      Response.json({
        data: [{ id: 'openai/gpt-5.6-terra' }, { id: 'anthropic/claude-sonnet-5.5' }],
      });
    const { app } = setup({}, fetcher);
    const res = await app.request('/api/models?baseUrl=https://openrouter.ai/api/v1');
    expect(await res.json()).toEqual({
      models: ['anthropic/claude-sonnet-5.5', 'openai/gpt-5.6-terra'],
    });
  });
});
