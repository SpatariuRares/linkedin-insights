import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '../db.ts';
import { parseBody } from '../validate.ts';
import { getVoice, MAX_EXAMPLES, setVoice } from '../store/voice.ts';

const text = (max: number) => z.string().max(max);

const voiceSchema = z.object({
  about: text(4000),
  audience: text(2000),
  styleRules: text(4000),
  language: z.string().trim().min(1).max(60),
  examples: z.array(text(6000)).max(MAX_EXAMPLES),
});

export function voiceRoutes({ db }: { db: DB }) {
  const app = new Hono();
  app.get('/voice', (c) => c.json(getVoice(db)));
  app.put('/voice', async (c) => {
    const body = await parseBody(c, voiceSchema);
    if (body.error) return body.error;
    return c.json(setVoice(db, body.data));
  });
  return app;
}
