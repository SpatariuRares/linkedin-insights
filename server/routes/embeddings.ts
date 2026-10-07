import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '../db.ts';
import { parseBody } from '../validate.ts';
import type { EmbeddingRunner } from '../embeddings/runner.ts';
import { setEmbeddingConfig } from '../store/embeddings.ts';

const configSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.url().max(300),
  apiKeyEnv: z
    .string()
    .trim()
    .regex(/^[A-Z_][A-Z0-9_]*$/, 'Usa il nome della variabile, es. OPENROUTER_API_KEY')
    .max(100)
    .nullable(),
  model: z.string().trim().min(1).max(200),
});

export function embeddingRoutes({ db, embedder }: { db: DB; embedder: EmbeddingRunner }) {
  const app = new Hono();

  app.get('/embeddings/status', (c) => c.json(embedder.status()));

  /** Saving starts indexing right away; a new model re-indexes every article. */
  app.put('/embeddings/config', async (c) => {
    const body = await parseBody(c, configSchema);
    if (body.error) return body.error;
    setEmbeddingConfig(db, body.data);
    void embedder.runNow();
    return c.json(embedder.status());
  });

  app.post('/embeddings/run', (c) => {
    void embedder.runNow();
    return c.json(embedder.status());
  });

  return app;
}
