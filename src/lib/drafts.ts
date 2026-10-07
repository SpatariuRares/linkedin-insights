export type DraftVariant = { angle: string; text: string };

export type DraftVersion = {
  id: number;
  n: number;
  variants: DraftVariant[];
  hooks: string[];
  instruction: string | null;
  model: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  createdAt: string;
};

export type DraftSource = {
  articleId: number;
  title: string;
  url: string;
  source: string;
  fullText: boolean | null;
};

export type Draft = {
  id: number;
  thought: string;
  profileId: number | null;
  profileName: string | null;
  calendarEntryId: string | null;
  text: string;
  createdAt: string;
  updatedAt: string;
  sources: DraftSource[];
  versions: DraftVersion[];
};

/** LinkedIn's hard limit for a post. */
export const LINKEDIN_MAX_CHARS = 3000;

/** Puts `hook` in place of the post's first line (or paragraph opener). */
export function replaceFirstLine(text: string, hook: string): string {
  const i = text.indexOf('\n');
  return i === -1 ? hook : `${hook}${text.slice(i)}`;
}

export const QUICK_REVISIONS = [
  'Più corto',
  'Più personale',
  'Meno formale',
  'Hook più forte',
] as const;
