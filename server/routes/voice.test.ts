// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../app.ts';
import { openDb } from '../db.ts';

const VOICE = {
  about: 'Product manager, 8 anni nel fintech.',
  audience: 'Altri dev e recruiter tech.',
  styleRules: 'Frasi brevi, niente emoji, massimo 3 hashtag.',
  language: 'italiano',
  examples: ['Primo post', 'Secondo post'],
};

describe('voice API', () => {
  it('starts empty, in Italian', async () => {
    const app = createApp({ db: openDb(':memory:') });
    expect(await (await app.request('/api/voice')).json()).toEqual({
      about: '',
      audience: '',
      styleRules: '',
      language: 'italiano',
      examples: [],
    });
  });

  it('saves the voice and keeps it across restarts', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'voice-')), 'app.db');
    const first = openDb(file);
    await createApp({ db: first }).request('/api/voice', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VOICE),
    });
    first.close();
    const reopened = createApp({ db: openDb(file) });
    expect(await (await reopened.request('/api/voice')).json()).toEqual(VOICE);
  });

  it('accepts at most 5 examples', async () => {
    const app = createApp({ db: openDb(':memory:') });
    const res = await app.request('/api/voice', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VOICE, examples: ['1', '2', '3', '4', '5', '6'] }),
    });
    expect(res.status).toBe(400);
  });
});
