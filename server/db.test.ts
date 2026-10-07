// @vitest-environment node
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrate } from './db.ts';
import { MIGRATIONS } from './migrations.ts';

describe('migrate', () => {
  it('applies every migration once and records the version', () => {
    const db = new Database(':memory:');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    // Running again is a no-op instead of failing on "table already exists".
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
  });
});
