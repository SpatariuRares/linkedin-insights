import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '../db.ts';
import type { Fetcher } from '../http.ts';
import { idParam, parseBody } from '../validate.ts';
import { getArticleText } from '../articles/text.ts';
import { draftPrompt, revisionPrompt, systemPrompt } from '../agent/compose.ts';
import { runDraft, type GenerateFn } from '../agent/run.ts';
import { LlmError } from '../llm/types.ts';
import { getDefaultProfile, getProfile } from '../store/profiles.ts';
import { getVoice } from '../store/voice.ts';
import {
  addVersion,
  createDraft,
  getDraft,
  saveDraftToCalendar,
  setDraftText,
} from '../store/drafts.ts';

export type DraftDeps = { db: DB; fetcher: Fetcher; generate: GenerateFn; now: () => Date };

const createSchema = z.object({
  articleIds: z.array(z.number().int().positive()).min(1).max(5),
  thought: z.string().trim().max(2000).default(''),
  profileId: z.number().int().positive().optional(),
});
const patchSchema = z.object({ text: z.string().max(10_000) });
const saveSchema = z.object({
  text: z.string().max(10_000).optional(),
  pillarId: z.string().nullable().default(null),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
const reviseSchema = z.object({
  instruction: z.string().trim().min(2).max(1000),
  text: z.string().max(10_000).optional(),
  profileId: z.number().int().positive().optional(),
});

function llmFailure(err: unknown) {
  return err instanceof LlmError ? err.message : `Errore inatteso: ${(err as Error).message}`;
}

export function draftRoutes({ db, fetcher, generate, now }: DraftDeps) {
  const app = new Hono();

  app.post('/drafts', async (c) => {
    const body = await parseBody(c, createSchema);
    if (body.error) return body.error;
    const { articleIds, thought, profileId } = body.data;

    const profile = profileId ? getProfile(db, profileId) : getDefaultProfile(db);
    if (!profile) {
      return c.json(
        { error: 'Nessun modello configurato: aggiungine uno in Impostazioni → Modelli.' },
        400,
      );
    }

    const articles = await Promise.all(articleIds.map((id) => getArticleText(db, id, { fetcher })));
    if (articles.some((a) => a === null)) {
      return c.json({ error: 'Uno degli articoli selezionati non esiste più.' }, 404);
    }

    const voice = getVoice(db);
    let run;
    try {
      run = await runDraft(generate, profile, {
        system: systemPrompt(voice),
        prompt: draftPrompt({ voice, articles: articles.map((a) => a!), thought }),
      });
    } catch (err) {
      return c.json({ error: llmFailure(err) }, 502);
    }

    const id = createDraft(
      db,
      { thought, profileId: profile.id, articleIds, text: run.output.variants[0].text },
      now(),
    );
    addVersion(
      db,
      id,
      { output: run.output, instruction: null, model: run.model, usage: run.usage },
      now(),
    );
    return c.json(getDraft(db, id), 201);
  });

  app.post('/drafts/:id/revise', async (c) => {
    const id = idParam(c);
    const draft = id ? getDraft(db, id) : null;
    if (!id || !draft) return c.json({ error: 'Bozza non trovata.' }, 404);
    const body = await parseBody(c, reviseSchema);
    if (body.error) return body.error;

    // The editor sends what it shows, so a revision never races the autosave.
    const currentText = body.data.text ?? draft.text;
    if (body.data.text !== undefined) setDraftText(db, id, currentText, now());

    const profile =
      (body.data.profileId ? getProfile(db, body.data.profileId) : null) ??
      (draft.profileId ? getProfile(db, draft.profileId) : null) ??
      getDefaultProfile(db);
    if (!profile) {
      return c.json(
        { error: 'Nessun modello configurato: aggiungine uno in Impostazioni → Modelli.' },
        400,
      );
    }

    const articles = (
      await Promise.all(draft.sources.map((s) => getArticleText(db, s.articleId, { fetcher })))
    ).filter((a) => a !== null);
    const voice = getVoice(db);
    let run;
    try {
      run = await runDraft(generate, profile, {
        system: systemPrompt(voice),
        prompt: revisionPrompt({
          voice,
          articles,
          thought: draft.thought,
          currentText,
          instruction: body.data.instruction,
        }),
      });
    } catch (err) {
      return c.json({ error: llmFailure(err) }, 502);
    }

    addVersion(
      db,
      id,
      {
        output: run.output,
        instruction: body.data.instruction,
        model: run.model,
        usage: run.usage,
      },
      now(),
    );
    setDraftText(db, id, run.output.variants[0].text, now());
    return c.json(getDraft(db, id));
  });

  app.post('/drafts/:id/save', async (c) => {
    const id = idParam(c);
    if (!id || !getDraft(db, id)) return c.json({ error: 'Bozza non trovata.' }, 404);
    const body = await parseBody(c, saveSchema);
    if (body.error) return body.error;
    if (body.data.text !== undefined) setDraftText(db, id, body.data.text, now());
    saveDraftToCalendar(db, id, { pillarId: body.data.pillarId, day: body.data.day }, now());
    return c.json(getDraft(db, id));
  });

  app.get('/drafts/:id', (c) => {
    const id = idParam(c);
    const draft = id ? getDraft(db, id) : null;
    return draft ? c.json(draft) : c.json({ error: 'Bozza non trovata.' }, 404);
  });

  app.patch('/drafts/:id', async (c) => {
    const id = idParam(c);
    if (!id || !getDraft(db, id)) return c.json({ error: 'Bozza non trovata.' }, 404);
    const body = await parseBody(c, patchSchema);
    if (body.error) return body.error;
    setDraftText(db, id, body.data.text, now());
    return c.json({ ok: true });
  });

  return app;
}
