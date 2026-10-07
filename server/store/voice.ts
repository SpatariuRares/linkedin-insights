import type { DB } from '../db.ts';

export type Voice = {
  about: string;
  audience: string;
  styleRules: string;
  language: string;
  examples: string[];
};

export const MAX_EXAMPLES = 5;

export function getVoice(db: DB): Voice {
  const row = db
    .prepare(
      'SELECT about, audience, style_rules AS styleRules, language, examples FROM voice WHERE id = 1',
    )
    .get() as Omit<Voice, 'examples'> & { examples: string };
  return { ...row, examples: JSON.parse(row.examples) as string[] };
}

export function setVoice(db: DB, voice: Voice) {
  db.prepare(
    `UPDATE voice SET about = ?, audience = ?, style_rules = ?, language = ?, examples = ?
     WHERE id = 1`,
  ).run(
    voice.about,
    voice.audience,
    voice.styleRules,
    voice.language,
    JSON.stringify(voice.examples.slice(0, MAX_EXAMPLES)),
  );
  return getVoice(db);
}
