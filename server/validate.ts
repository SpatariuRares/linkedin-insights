import type { Context } from 'hono';
import type { z } from 'zod';

export async function parseBody<T extends z.ZodType>(c: Context, schema: T) {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { error: c.json({ error: 'Corpo della richiesta non valido (JSON atteso).' }, 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: c.json({ error: 'Dati non validi.', issues: result.error.issues }, 400) };
  }
  return { data: result.data as z.infer<T> };
}

export function idParam(c: Context): number | null {
  const id = Number(c.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}
