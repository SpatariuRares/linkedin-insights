---
name: add-migration
description: Aggiunge una nuova migrazione SQLite in coda a MIGRATIONS (server/migrations.ts) senza toccare quelle esistenti, poi aggiorna lo store, i test e verifica. Usare per qualsiasi cambio di schema del database.
disable-model-invocation: true
argument-hint: '<cosa deve cambiare nello schema>'
---

# Nuova migrazione SQLite

Cambio richiesto: $ARGUMENTS

## Come funziona lo schema qui

- `server/migrations.ts` esporta `MIGRATIONS: string[]`. **Append-only**: indice + 1 = il `user_version` che il database raggiunge dopo averla eseguita.
- `migrate()` in `server/db.ts` esegue ogni migrazione mancante in una transazione e aggiorna `PRAGMA user_version`. Il database reale è `data/app.db` (o `DB_FILE`).
- `foreign_keys = ON`, quindi `REFERENCES` e `ON DELETE` vengono applicati davvero.
- Un hook PreToolUse chiede conferma se una modifica a `migrations.ts` non è una pura aggiunta in coda. Se scatta, hai sbagliato approccio: non toccare le migrazioni esistenti.

## Passi

1. **Leggi** `server/migrations.ts` per intero e lo store interessato in `server/store/`.
2. **Aggiungi in coda** un nuovo elemento all'array, con il commento numerato come gli altri:
   ```ts
     // N — cosa fa, in una riga
     `
     ALTER TABLE ... ;
     `,
   ];
   ```
   - Colonne in `snake_case`; date come `TEXT` ISO (`created_at TEXT NOT NULL`); booleani come `INTEGER` 0/1; JSON come `TEXT`.
   - Enum con `CHECK (col IN (...))`, come `articles.state` o `profiles.kind`.
   - SQLite non può modificare un `CHECK` o cambiare il tipo di una colonna con `ALTER`: per farlo serve ricreare la tabella (`CREATE TABLE x_new` → `INSERT INTO x_new SELECT ...` → `DROP TABLE x` → `ALTER TABLE x_new RENAME TO x`, poi ricreare gli indici).
   - `ALTER TABLE ... ADD COLUMN` con `NOT NULL` richiede un `DEFAULT`.
   - Se servono dati iniziali, inseriscili nella stessa migrazione.
3. **Aggiorna lo store** (`server/store/*.ts`): colonne nelle `SELECT` con alias camelCase (`style_rules AS styleRules`), conversioni `0/1 → boolean` e `JSON.parse` dove servono, tipi esportati.
4. **Aggiorna i tipi condivisi** in `src/lib/` se il dato arriva al frontend.
5. **Test**:
   - `server/db.test.ts` già verifica che tutte le migrazioni girino una volta sola: non serve duplicarlo.
   - Se la migrazione trasforma dati esistenti, aggiungi in `server/db.test.ts` un test che: apre `new Database(':memory:')`, esegue solo le migrazioni precedenti (`db.exec(MIGRATIONS[i])` + `user_version`), inserisce righe con il vecchio schema, poi chiama `migrate(db)` e verifica i dati.
   - Aggiorna o aggiungi i test di route/store che usano le nuove colonne.
6. **Verifica**: `npm test` e `npx tsc -b`. Riporta l'esito reale.

## Da non fare

- Modificare, riordinare o cancellare una migrazione esistente.
- Toccare `data/app.db` a mano.
- Fare `DROP` di colonne o tabelle con dati senza chiederlo prima all'utente.
