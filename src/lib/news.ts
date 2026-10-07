/** Shapes returned by the local server's news endpoints. */
export type Feed = {
  id: number;
  url: string;
  title: string;
  siteUrl: string | null;
  enabled: boolean;
  createdAt: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  errorCount: number;
  articleCount: number;
};

export type DiscoveredFeed = { url: string; title: string | null; alreadyAdded: boolean };

export type ArticleState = 'inbox' | 'saved' | 'discarded' | 'archived';

export type Article = {
  id: number;
  feedId: number | null;
  source: string;
  url: string;
  title: string;
  snippet: string;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  state: ArticleState;
  score: ArticleScore | null;
};

export type ArticleScore = {
  pillarId: string | null;
  pillarProb: number | null;
  relevance: number | null;
  postWorthy: boolean | null;
  postWorthyProb: number | null;
};

export type TriageStatus = {
  online: boolean;
  running: boolean;
  pending: number;
  lastRunAt: string | null;
  lastError: string | null;
  url: string;
};

export type ArticleFilters = {
  sort: 'date' | 'relevance';
  minRelevance: number;
  pillarId: string;
  /** null = every source. */
  feedId: number | null;
  postWorthyOnly: boolean;
};

export const DEFAULT_FILTERS: ArticleFilters = {
  sort: 'date',
  minRelevance: 0,
  pillarId: '',
  feedId: null,
  postWorthyOnly: false,
};

/** "3,2/4" style label for an expected relevance level. */
export function formatRelevance(r: number | null): string {
  return r === null ? '—' : `${r.toFixed(1).replace('.', ',')}/4`;
}

export type FeedStatus = { running: boolean; lastRunAt: string | null; nextRunAt: string | null };

export type RefreshSummary = { refreshed: number; added: number; failed: number };

const rtf = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "3 ore fa", "ieri", "adesso". Older than a week falls back to a date. */
export function formatRelative(iso: string | null, now = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = d.getTime() - now.getTime();
  if (Math.abs(diff) > 7 * 86_400_000) {
    return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(d);
  }
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'adesso';
}
