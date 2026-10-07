import type { DB } from '../db.ts';
import { httpGet, type Fetcher } from '../http.ts';
import { extractArticleText } from './extract.ts';

export type ArticleText = {
  articleId: number;
  title: string;
  url: string;
  source: string;
  text: string;
  /** False when only the feed's snippet was available (paywall, block, timeout...). */
  fullText: boolean;
};

type Row = {
  id: number;
  title: string;
  url: string;
  source: string;
  snippet: string;
  full_text: string | null;
  full_text_ok: number | null;
};

/**
 * The text the agent reads for an article: the full page when it can be extracted, otherwise the
 * feed snippet. The outcome is stored, so each article page is downloaded at most once.
 */
export async function getArticleText(
  db: DB,
  articleId: number,
  deps: { fetcher: Fetcher },
): Promise<ArticleText | null> {
  const row = db
    .prepare(
      `SELECT id, title, url, source_title AS source, snippet, full_text, full_text_ok
       FROM articles WHERE id = ?`,
    )
    .get(articleId) as Row | undefined;
  if (!row) return null;

  const base = { articleId: row.id, title: row.title, url: row.url, source: row.source };
  if (row.full_text !== null) {
    return { ...base, text: row.full_text, fullText: row.full_text_ok === 1 };
  }

  let extracted: string | null = null;
  try {
    const res = await httpGet(row.url, deps.fetcher, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (res.status < 400) extracted = extractArticleText(res.text, res.url);
  } catch {
    extracted = null;
  }

  const text = extracted ?? row.snippet;
  db.prepare('UPDATE articles SET full_text = ?, full_text_ok = ? WHERE id = ?').run(
    text,
    extracted ? 1 : 0,
    row.id,
  );
  return { ...base, text, fullText: extracted !== null };
}
