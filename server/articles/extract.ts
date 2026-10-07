import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

/** Below this the "article" is usually a cookie wall, a login page or a teaser. */
export const MIN_ARTICLE_CHARS = 400;
/** Enough for any news piece; keeps one prompt from carrying a whole e-book. */
export const MAX_ARTICLE_CHARS = 20_000;

/**
 * The main text of a web page, as Firefox's reader mode would show it: navigation, ads and
 * comments dropped, paragraphs kept. Null when the page has no recognisable article.
 */
export function extractArticleText(html: string, url: string): string | null {
  const { document } = parseHTML(html);
  // Readability resolves relative links against this; linkedom leaves it empty.
  Object.defineProperty(document, 'baseURI', { value: url });
  let article;
  try {
    article = new Readability(document as unknown as Document).parse();
  } catch {
    return null;
  }
  const text = (article?.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (text.length < MIN_ARTICLE_CHARS) return null;
  return text.length > MAX_ARTICLE_CHARS ? `${text.slice(0, MAX_ARTICLE_CHARS)}…` : text;
}
