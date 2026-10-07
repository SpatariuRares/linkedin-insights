# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Crescita": a personal LinkedIn growth dashboard (follower goal, editorial calendar, RSS news inbox,
LLM-drafted posts). Fork of `obrenoalvim/linkedin-insights`. Single user, runs locally only — the
API server binds to `127.0.0.1` because it holds API keys and personal data. There is no deploy,
login or multi-device story (see "Fuori ambito" in `docs/PRD-news-agent.md`).

**Language:** all user-facing text — UI copy, API error messages, toasts, LLM prompts — is
**Italian**. Code identifiers and code comments are English.

## Commands

Node 22 (`.nvmrc`).

```bash
npm run dev          # Vite (5173) + API (tsx watch server/index.ts, 127.0.0.1:8787); Vite proxies /api
npm run dev:full     # same + Rizzo Flow (uv run rizzo serve in $RIZZO_FLOW_DIR, port 8017) if installed
npm test             # vitest run (src/**/*.test.ts(x) and server/**/*.test.ts, jsdom env)
npx vitest run server/feeds/feeds.test.ts      # single file
npx vitest run -t "dedup"                       # by test name
npm run lint         # oxlint && prettier --check .
npm run format       # prettier --write .
npm run build        # tsc -b (app + node + server projects) && vite build
```

CI (`.github/workflows/ci.yml`) runs `npm audit --audit-level=high`, lint, tests, build. The husky
pre-commit hook runs lint-staged (oxlint --fix + prettier).

Env (`.env`, see `.env.example`): `API_PORT`, `DB_FILE` (default `data/app.db`), `RIZZO_FLOW_DIR`,
`RIZZO_SERVE_ARGS`, `RIZZO_URL`, `CODEX_BIN`, and whatever env var name a model profile references
for its API key (e.g. `OPENROUTER_API_KEY`). Sample inputs live in `.sample/` (an analytics xlsx
export and an OPML file).

## Architecture

Two halves in one repo, sharing code:

- **`src/`** — Vite + React 19 + Tailwind v4 SPA. No router: `App.tsx` switches tabs
  (dashboard / news / calendar / settings / data) and an open-draft overlay.
- **`server/`** — Hono on Node (`@hono/node-server`) + `better-sqlite3`, run directly with `tsx`
  (no build step for the server; `tsconfig.server.json` is typecheck-only).

### Shared code between client and server

`src/lib/` holds pure domain logic (`linkedin-export.ts` xlsx parser, `history.ts` merge,
`goal.ts`, `calendar.ts`, `schemas.ts` Zod schemas, `storage.ts` `AppState`/`defaultState`). The
server imports these directly (e.g. `server/app.ts` uses `appStateSchema` and `mergeExport`). Note
the import style difference: server-internal imports use explicit `.ts` extensions
(`'./db.ts'`), imports into `src/` don't (`'../src/lib/schemas'`).

The xlsx is parsed **in the browser** (`parseLinkedInExport`), then the parsed `LinkedInExport` is
POSTed to `/api/history/import`, where the server merges it into the cumulative history. Parsing is
by sheet position/shape, not by labels, so it works across LinkedIn locales.

### Client state

`src/hooks/use-app-state.ts` loads `AppState` from `GET /api/state` and applies edits
optimistically, sending them through a per-slice promise queue (`goal`, `calendar`) so writes land
in order. All HTTP goes through `src/lib/api.ts` (`api.*` methods, `ApiError`). News, drafts,
profiles and voice are fetched by their own pages, not held in `AppState`.

Legacy: the app used to be browser-only (localStorage). On first load, `migrateFromBrowser` sends
any old localStorage state to `POST /api/migrate`, which refuses with 409 once the DB has user data.

### Server layout

- `index.ts` wires real deps and starts timers; `app.ts` `createApp(deps)` is the pure HTTP surface
  with all I/O injected (`db`, `now`, `fetcher`, `scheduler`, `triage`, `env`, `generate`). Route
  groups in `routes/*.ts` are factories taking the deps they need, mounted under `/api`.
- `store/*.ts` — the only place with SQL; one function per operation.
- `migrations.ts` — **append-only** array of SQL strings; `PRAGMA user_version` tracks how many ran
  (`db.ts` `migrate`). Never edit a shipped migration; add a new entry.
- `feeds/` — discovery (`<link rel=alternate>`), OPML, `rss-parser` fetch with ETag/Last-Modified,
  canonical-URL dedup (`canonical.ts`), `FeedScheduler` (every 30 min, one feed at a time, archives
  untouched inbox articles after 14 days, triggers triage via `afterRun`).
- `articles/` — full-text extraction with Readability + linkedom, falling back to the snippet.
- `triage/` — `TriageRunner` polls Rizzo Flow (local Python classifier, external repo) every 2 min
  and scores unscored inbox/saved articles: pillar choice, relevance 0–4, post-worthy. The app must
  work when Rizzo Flow is offline.
- `llm/` — `generate(profile, input, deps)` dispatches on `profile.kind`: `openai-compatible`
  (fetch to `{baseUrl}/chat/completions`, key read from the env var named in the profile),
  `codex-cli` (spawns `codex exec --json`), `claude-cli` (not implemented yet). Throw `LlmError`
  for messages meant to be shown to the user.
- `agent/` — `compose.ts` builds the Italian ghostwriter prompt from Voice + sources + the user's
  thought and validates the JSON answer (2 variants + 3 hooks) with Zod; `run.ts` `runDraft`
  retries once on malformed output.

### Testing conventions

- No test touches the network, real feeds or real models.
- API tests: `testApp()` from `server/test-utils.ts` (in-memory SQLite with migrations, fixed
  `now`) and Hono's `app.request()` — no ports opened.
- HTTP: inject `fakeFetch(routes)` from `server/test-fetch.ts`; fixtures in
  `server/feeds/__fixtures__/`.
- LLM: pass a fake `generate` to `createApp`; CLI adapters are tested against
  `server/llm/__fixtures__/fake-codex.mjs`.
- Timers: Vitest fake timers for the scheduler.

## Planning docs

`docs/PRD-news-agent.md` (Italian) is the spec for the news + agent work; `docs/issues.json` tracks
its issues (`NA-xx`) with status, blockers and user-story links — update an issue's status there
when you finish it.
