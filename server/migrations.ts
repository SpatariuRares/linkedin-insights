/**
 * Append-only. Never edit a migration that has shipped: add a new one. Index + 1 is the
 * `user_version` the database reaches after running it.
 */
export const MIGRATIONS: string[] = [
  // 1 — the state that used to live in localStorage
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT INTO settings (key, value) VALUES
    ('goal_target', '5000'),
    ('goal_target_day', 'null'),
    ('posts_per_week', '3');

  CREATE TABLE pillars (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    slot     INTEGER NOT NULL,
    position INTEGER NOT NULL
  );
  INSERT INTO pillars (id, name, slot, position) VALUES
    ('p1', 'Competenze', 1, 0),
    ('p2', 'Storie personali', 2, 1),
    ('p3', 'Opinioni', 3, 2);

  CREATE TABLE calendar_entries (
    id        TEXT PRIMARY KEY,
    day       TEXT,
    title     TEXT NOT NULL,
    notes     TEXT NOT NULL DEFAULT '',
    format    TEXT NOT NULL,
    pillar_id TEXT,
    status    TEXT NOT NULL,
    post_url  TEXT,
    position  INTEGER NOT NULL
  );

  CREATE TABLE daily_engagement (
    day         TEXT PRIMARY KEY,
    impressions INTEGER NOT NULL,
    engagements INTEGER NOT NULL
  );

  CREATE TABLE daily_followers (
    day           TEXT PRIMARY KEY,
    new_followers INTEGER NOT NULL
  );

  CREATE TABLE follower_totals (
    day   TEXT PRIMARY KEY,
    total INTEGER NOT NULL
  );

  CREATE TABLE tracked_posts (
    url         TEXT PRIMARY KEY,
    day         TEXT NOT NULL,
    engagements INTEGER,
    impressions INTEGER
  );

  CREATE TABLE demographics (
    position   INTEGER PRIMARY KEY,
    category   TEXT NOT NULL,
    value      TEXT NOT NULL,
    percentage REAL NOT NULL
  );

  CREATE TABLE imports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name       TEXT NOT NULL,
    imported_at     TEXT NOT NULL,
    range_label     TEXT,
    first_day       TEXT,
    last_day        TEXT,
    impressions     INTEGER,
    members_reached INTEGER
  );
  `,
  // 2 — RSS feeds and their articles
  `
  CREATE TABLE feeds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    site_url        TEXT,
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL,
    last_fetched_at TEXT,
    last_error      TEXT,
    error_count     INTEGER NOT NULL DEFAULT 0,
    etag            TEXT,
    last_modified   TEXT
  );

  CREATE TABLE articles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id       INTEGER REFERENCES feeds(id) ON DELETE SET NULL,
    source_title  TEXT NOT NULL,
    canonical_url TEXT NOT NULL UNIQUE,
    url           TEXT NOT NULL,
    guid          TEXT,
    title         TEXT NOT NULL,
    snippet       TEXT NOT NULL DEFAULT '',
    author        TEXT,
    published_at  TEXT,
    fetched_at    TEXT NOT NULL,
    state         TEXT NOT NULL DEFAULT 'inbox'
                  CHECK (state IN ('inbox', 'saved', 'discarded', 'archived')),
    state_changed_at TEXT,
    full_text     TEXT,
    full_text_ok  INTEGER
  );
  CREATE INDEX articles_state_date ON articles (state, published_at DESC);
  CREATE INDEX articles_feed ON articles (feed_id);
  `,
  // 3 — model profiles and the writing voice
  `
  CREATE TABLE profiles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('openai-compatible', 'claude-cli', 'codex-cli')),
    base_url    TEXT,
    model       TEXT NOT NULL DEFAULT '',
    api_key_env TEXT,
    timeout_ms  INTEGER NOT NULL DEFAULT 120000,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE voice (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    about       TEXT NOT NULL DEFAULT '',
    audience    TEXT NOT NULL DEFAULT '',
    style_rules TEXT NOT NULL DEFAULT '',
    language    TEXT NOT NULL DEFAULT 'italiano',
    examples    TEXT NOT NULL DEFAULT '[]'
  );
  INSERT INTO voice (id) VALUES (1);
  `,
  // 4 — post drafts written by the agent, with their sources and every version
  `
  CREATE TABLE drafts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    thought           TEXT NOT NULL DEFAULT '',
    profile_id        INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
    calendar_entry_id TEXT,
    text              TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );

  CREATE TABLE draft_sources (
    draft_id   INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    article_id INTEGER NOT NULL REFERENCES articles(id),
    position   INTEGER NOT NULL,
    PRIMARY KEY (draft_id, article_id)
  );

  CREATE TABLE draft_versions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id      INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    n             INTEGER NOT NULL,
    variants      TEXT NOT NULL,
    hooks         TEXT NOT NULL,
    instruction   TEXT,
    model         TEXT,
    input_tokens  INTEGER,
    output_tokens INTEGER,
    created_at    TEXT NOT NULL,
    UNIQUE (draft_id, n)
  );
  `,
  // 5 — Rizzo Flow triage of each article
  `
  CREATE TABLE article_scores (
    article_id       INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
    pillar_id        TEXT,
    pillar_prob      REAL,
    relevance        REAL,
    post_worthy      INTEGER,
    post_worthy_prob REAL,
    raw              TEXT NOT NULL,
    model            TEXT,
    scored_at        TEXT NOT NULL
  );
  `,
  // 6 — full-text search over article titles and summaries (news search, related articles)
  `
  CREATE VIRTUAL TABLE articles_fts USING fts5(
    title, snippet,
    content = 'articles', content_rowid = 'id',
    tokenize = 'unicode61 remove_diacritics 2'
  );
  INSERT INTO articles_fts (rowid, title, snippet) SELECT id, title, snippet FROM articles;
  CREATE TRIGGER articles_fts_insert AFTER INSERT ON articles BEGIN
    INSERT INTO articles_fts (rowid, title, snippet) VALUES (new.id, new.title, new.snippet);
  END;
  CREATE TRIGGER articles_fts_delete AFTER DELETE ON articles BEGIN
    INSERT INTO articles_fts (articles_fts, rowid, title, snippet)
      VALUES ('delete', old.id, old.title, old.snippet);
  END;
  CREATE TRIGGER articles_fts_update AFTER UPDATE OF title, snippet ON articles BEGIN
    INSERT INTO articles_fts (articles_fts, rowid, title, snippet)
      VALUES ('delete', old.id, old.title, old.snippet);
    INSERT INTO articles_fts (rowid, title, snippet) VALUES (new.id, new.title, new.snippet);
  END;
  `,
  // 7 — embeddings for search by meaning (one model at a time) and their settings
  `
  CREATE TABLE article_embeddings (
    article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
    model      TEXT NOT NULL,
    vector     BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
  INSERT INTO settings (key, value) VALUES
    ('embeddings', '{"enabled":true,"baseUrl":"https://openrouter.ai/api/v1","apiKeyEnv":"OPENROUTER_API_KEY","model":"baai/bge-m3"}');
  `,
  // 8 — Hacker News items were embedded with their boilerplate summary: embed them again
  `
  DELETE FROM article_embeddings
  WHERE article_id IN (SELECT id FROM articles WHERE snippet LIKE '%Comments URL:%');
  `,
];
