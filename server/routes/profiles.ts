import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '../db.ts';
import type { Fetcher } from '../http.ts';
import { idParam, parseBody } from '../validate.ts';
import { generate } from '../llm/index.ts';
import { listModels } from '../llm/openai-compatible.ts';
import { LlmError, type Profile } from '../llm/types.ts';
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  setDefaultProfile,
  updateProfile,
} from '../store/profiles.ts';

export type ProfileDeps = {
  db: DB;
  fetcher: Fetcher;
  env: Record<string, string | undefined>;
  now: () => Date;
};

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['openai-compatible', 'claude-cli', 'codex-cli']),
    baseUrl: z.url().nullable().default(null),
    model: z.string().trim().max(200).default(''),
    apiKeyEnv: z
      .string()
      .trim()
      .regex(/^[A-Z_][A-Z0-9_]*$/, 'Usa il nome della variabile, es. OPENROUTER_API_KEY')
      .nullable()
      .default(null),
    timeoutMs: z.number().int().min(5_000).max(600_000).optional(),
  })
  .refine((p) => p.kind !== 'openai-compatible' || (p.baseUrl && p.model), {
    message: 'Per un provider HTTP servono URL e modello.',
  });

export function profileRoutes({ db, fetcher, env, now }: ProfileDeps) {
  const app = new Hono();

  /** Never the key itself: only whether the variable it names is set. */
  const view = (p: Profile) => ({
    ...p,
    keyPresent: p.apiKeyEnv ? Boolean(env[p.apiKeyEnv]?.trim()) : null,
  });

  app.get('/profiles', (c) => c.json(listProfiles(db).map(view)));

  app.post('/profiles', async (c) => {
    const body = await parseBody(c, profileSchema);
    if (body.error) return body.error;
    return c.json(view(createProfile(db, body.data, now())), 201);
  });

  app.put('/profiles/:id', async (c) => {
    const id = idParam(c);
    if (!id || !getProfile(db, id)) return c.json({ error: 'Profilo non trovato.' }, 404);
    const body = await parseBody(c, profileSchema);
    if (body.error) return body.error;
    return c.json(view(updateProfile(db, id, body.data)!));
  });

  app.post('/profiles/:id/default', (c) => {
    const id = idParam(c);
    if (!id || !getProfile(db, id)) return c.json({ error: 'Profilo non trovato.' }, 404);
    setDefaultProfile(db, id);
    return c.json(listProfiles(db).map(view));
  });

  app.delete('/profiles/:id', (c) => {
    const id = idParam(c);
    if (!id || !getProfile(db, id)) return c.json({ error: 'Profilo non trovato.' }, 404);
    deleteProfile(db, id);
    return c.body(null, 204);
  });

  /** A tiny real request, to check URL, key and model before relying on the profile. */
  app.post('/profiles/:id/test', async (c) => {
    const id = idParam(c);
    const profile = id ? getProfile(db, id) : null;
    if (!profile) return c.json({ error: 'Profilo non trovato.' }, 404);
    const started = Date.now();
    try {
      const result = await generate(
        profile,
        {
          system: 'Rispondi in modo brevissimo.',
          prompt: 'Rispondi solo con la parola: ok',
          maxTokens: 20,
        },
        { fetcher, env },
      );
      return c.json({
        ok: true,
        text: result.text.trim(),
        model: result.model,
        ms: Date.now() - started,
      });
    } catch (err) {
      const message =
        err instanceof LlmError ? err.message : `Errore inatteso: ${(err as Error).message}`;
      return c.json({ ok: false, error: message, ms: Date.now() - started });
    }
  });

  app.get('/models', async (c) => {
    const baseUrl = c.req.query('baseUrl');
    if (!baseUrl) return c.json({ error: 'Indica baseUrl.' }, 400);
    try {
      return c.json({ models: await listModels(baseUrl, { fetcher }) });
    } catch (err) {
      return c.json({ error: (err as Error).message, models: [] }, 502);
    }
  });

  return app;
}
