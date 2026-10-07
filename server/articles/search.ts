/**
 * Turns free text into SQLite FTS5 queries over article titles and summaries. Feeds mix Italian
 * and English, so both languages' stopwords go; accents are stripped on both sides (the index uses
 * `remove_diacritics 2`), so "perche" finds "Perché".
 */

// "ai" (a + i) is left out on purpose: in these feeds it nearly always means AI.
const STOPWORDS = new Set(
  `
  a ad al alla alle allo agli anche ancora che chi ci come con contro cosa da dal dalla dalle
  dei del della delle dello degli di dopo e ed era essere fra gli ha hanno ho il in io la le lo
  loro ma mi ne nei nel nella nelle non noi o per piu poi quale quando quella quelle quello questa
  queste questo se si sono su sua sue sui sul sulla suo tra tu tutti tutto un una uno vi
  about after all also an and are as at be been but by can could did do does for from had has
  have he her his how i if into is it its just more most my no not now of on or our out over she
  so than that the their them then there these they this those to up was we were what when which
  who why will with would you your
  `
    .trim()
    .split(/\s+/),
);

/** Words too common in headlines to tie two stories together. */
const GENERIC = new Set(
  `
  new nuovo nuova nuovi nuove says dice secondo report rapporto year anno years anni day giorno
  week settimana first primo prima big grande make makes made get gets one two tre three
  amid despite still back away top reportedly here inside behind against under via said set take
  takes taking steps need needs way ways use using used doesn isn don won aren didn neither nor
  existing know knows going goes come comes look looks want wants getting
  `
    .trim()
    .split(/\s+/),
);

const MAX_TERMS = 12;

function words(text: string): string[] {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** The meaningful words of a search box query, in order, without duplicates. */
export function searchTerms(text: string): string[] {
  const terms = words(text).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return [...new Set(terms)].slice(0, MAX_TERMS);
}

/** The words of a headline that identify its story: no numbers, no generic news words. */
export function relatedTerms(title: string): string[] {
  return searchTerms(title).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !GENERIC.has(w));
}

/**
 * `all`: every term must appear (a search box), each as a prefix so results follow the typing.
 * `any`: one term is enough (related articles, ranked by bm25); only longer words are prefixes,
 * so "ai" does not match "air" while "chip" still matches "chips".
 */
export function ftsMatch(terms: string[], mode: 'all' | 'any'): string {
  if (mode === 'all') return terms.map((t) => `"${t}"*`).join(' ');
  return terms.map((t) => (t.length >= 4 ? `"${t}"*` : `"${t}"`)).join(' OR ');
}

/** How many of `terms` occur in `text`, with the same prefix rule as `ftsMatch(…, 'any')`. */
export function countMatched(terms: string[], text: string): number {
  const ws = words(text);
  return terms.filter((t) => ws.some((w) => (t.length >= 4 ? w.startsWith(t) : w === t))).length;
}
