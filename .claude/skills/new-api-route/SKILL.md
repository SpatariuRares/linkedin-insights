---
name: new-api-route
description: Crea o estende un gruppo di route Hono del server locale (server/routes) seguendo le convenzioni del progetto - factory xxxRoutes(deps), validazione zod con parseBody, store separato, test con app.request su DB in memoria, client in src/lib/api.ts. Usare quando si aggiunge un endpoint /api.
argument-hint: "<risorsa e operazioni, es. 'tags: list, create, delete'>"
---

# Nuova route API

Richiesta: $ARGUMENTS

Prima di scrivere, leggi un esempio completo simile a quello che serve: `server/routes/voice.ts` (semplice), `server/routes/profiles.ts` (CRUD) o `server/routes/drafts.ts` (con LLM e fetch). Copia il loro stile, non quello dei template qui sotto se differiscono.

## Struttura

| Livello   | File                              | Ruolo                                                                                                           |
| --------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Store     | `server/store/<risorsa>.ts`       | SQL puro con `better-sqlite3`, funzioni `(db, ...)`, alias camelCase nelle SELECT. Niente Hono.                 |
| Route     | `server/routes/<risorsa>.ts`      | `export function <risorsa>Routes(deps) { const app = new Hono(); ...; return app; }`                            |
| Montaggio | `server/app.ts`                   | `app.route('/', <risorsa>Routes({ db, ... }))` in fondo a `createApp`. Il prefisso `/api` è già nel `basePath`. |
| Test      | `server/routes/<risorsa>.test.ts` | Prima riga `// @vitest-environment node`.                                                                       |
| Client    | `src/lib/api.ts`                  | Nuovi metodi nell'oggetto `api`, tipi in `src/lib/<risorsa>.ts`.                                                |

Se serve una tabella nuova, usa prima `/add-migration`.

## Regole

- **Validazione**: ogni body passa da `parseBody(c, schema)` (`server/validate.ts`); se `body.error` restituiscilo così com'è. Gli id da path con `idParam(c)` → `null` = 400.
- **Zod 4**: limiti espliciti su ogni stringa (`.max(n)`) e array (`.max(n)`); `.trim().min(1)` per i campi obbligatori.
- **Errori**: JSON `{ error: '<messaggio in italiano per l'utente>' }` con lo status giusto (400 dati, 404 non trovato, 409 conflitto). Le eccezioni non gestite le prende `app.onError`.
- **Dipendenze iniettate**: `now`, `fetcher`, `generate` e `env` arrivano da `createApp`. Non chiamare mai `new Date()`, `fetch` o `process.env` direttamente in route o store: i test devono poterli sostituire.
- **Rete**: per URL esterni usa `httpGet(url, fetcher)` da `server/http.ts` (timeout + UA). Valida che l'URL sia `http(s)`.
- **Testo per l'utente** sempre in italiano; codice, nomi e commenti in inglese.

## Template route

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '../db.ts';
import { idParam, parseBody } from '../validate.ts';
import { createThing, deleteThing, listThings } from '../store/things.ts';

const thingSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export function thingRoutes({ db, now }: { db: DB; now: () => Date }) {
  const app = new Hono();

  app.get('/things', (c) => c.json(listThings(db)));

  app.post('/things', async (c) => {
    const body = await parseBody(c, thingSchema);
    if (body.error) return body.error;
    return c.json(createThing(db, body.data, now()), 201);
  });

  app.delete('/things/:id', (c) => {
    const id = idParam(c);
    if (id === null) return c.json({ error: 'Id non valido.' }, 400);
    if (!deleteThing(db, id)) return c.json({ error: 'Elemento non trovato.' }, 404);
    return c.body(null, 204);
  });

  return app;
}
```

## Template test

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { testApp } from '../test-utils.ts';

describe('things API', () => {
  it('creates and lists', async () => {
    const { json } = testApp();
    const res = await json('POST', '/api/things', { name: 'Primo' });
    expect(res.status).toBe(201);
    expect(await (await json('GET', '/api/things')).json()).toMatchObject([{ name: 'Primo' }]);
  });

  it('rejects invalid input', async () => {
    const { json } = testApp();
    expect((await json('POST', '/api/things', { name: '' })).status).toBe(400);
  });
});
```

Per route che fanno richieste HTTP usa `fakeFetch({ url: { body, type } })` e `fixture(name)` da `server/test-fetch.ts`, passando `fetcher` a `createApp`. Per route che generano testo passa un `generate` finto (vedi `server/routes/drafts.test.ts`): nessun test deve chiamare un modello vero.

Copri almeno: caso felice, input non valido (400), risorsa inesistente (404).

## Verifica

`npm test` e `npx tsc -b`. Riporta l'esito reale, compresi i fallimenti.
