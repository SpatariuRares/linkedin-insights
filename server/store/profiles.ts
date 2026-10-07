import type { DB } from '../db.ts';
import type { Profile, ProfileKind } from '../llm/types.ts';

export type ProfileInput = {
  name: string;
  kind: ProfileKind;
  baseUrl: string | null;
  model: string;
  apiKeyEnv: string | null;
  timeoutMs?: number;
};

const COLUMNS = `id, name, kind, base_url AS baseUrl, model, api_key_env AS apiKeyEnv,
  timeout_ms AS timeoutMs, is_default AS isDefault`;

type Row = Omit<Profile, 'isDefault'> & { isDefault: number };
const toProfile = (r: Row): Profile => ({ ...r, isDefault: r.isDefault === 1 });

export function listProfiles(db: DB): Profile[] {
  return (db.prepare(`SELECT ${COLUMNS} FROM profiles ORDER BY id`).all() as Row[]).map(toProfile);
}

export function getProfile(db: DB, id: number): Profile | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM profiles WHERE id = ?`).get(id) as Row | undefined;
  return row ? toProfile(row) : null;
}

export function getDefaultProfile(db: DB): Profile | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM profiles WHERE is_default = 1`).get() as
    Row | undefined;
  return row ? toProfile(row) : null;
}

/** The first profile becomes the default, so there is always one to generate with. */
export function createProfile(db: DB, input: ProfileInput, now: Date): Profile {
  const isFirst = (db.prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number }).n === 0;
  const info = db
    .prepare(
      `INSERT INTO profiles (name, kind, base_url, model, api_key_env, timeout_ms, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.kind,
      input.baseUrl,
      input.model,
      input.apiKeyEnv,
      input.timeoutMs ?? 120_000,
      isFirst ? 1 : 0,
      now.toISOString(),
    );
  return getProfile(db, Number(info.lastInsertRowid))!;
}

export function updateProfile(db: DB, id: number, input: ProfileInput): Profile | null {
  db.prepare(
    `UPDATE profiles SET name = ?, kind = ?, base_url = ?, model = ?, api_key_env = ?,
       timeout_ms = coalesce(?, timeout_ms) WHERE id = ?`,
  ).run(
    input.name,
    input.kind,
    input.baseUrl,
    input.model,
    input.apiKeyEnv,
    input.timeoutMs ?? null,
    id,
  );
  return getProfile(db, id);
}

export function setDefaultProfile(db: DB, id: number) {
  db.transaction(() => {
    db.prepare('UPDATE profiles SET is_default = 0').run();
    db.prepare('UPDATE profiles SET is_default = 1 WHERE id = ?').run(id);
  })();
}

/** Deleting the default hands the role to the oldest remaining profile. */
export function deleteProfile(db: DB, id: number) {
  db.transaction(() => {
    const wasDefault = getProfile(db, id)?.isDefault;
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    if (wasDefault) {
      db.prepare(
        'UPDATE profiles SET is_default = 1 WHERE id = (SELECT id FROM profiles ORDER BY id LIMIT 1)',
      ).run();
    }
  })();
}
