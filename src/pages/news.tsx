import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  ExternalLink,
  Link2,
  List,
  Newspaper,
  RefreshCw,
  Search,
  Share2,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input } from '../components/ui';
import { CreatePostPanel } from '../components/news/create-post-panel';
import { ScoreBadges } from '../components/news/score-badges';
import { TriageIndicator } from '../components/news/triage-indicator';
import { FiltersBar } from '../components/news/filters-bar';
import { RelatedArticles } from '../components/news/related-articles';
import { TopicGraphView } from '../components/news/topic-graph-view';
import type { Pillar } from '../lib/calendar';
import { api } from '../lib/api';
import {
  DEFAULT_FILTERS,
  formatRelative,
  type Article,
  type ArticleFilters,
  type ArticleState,
  type Feed,
  type FeedStatus,
  type TriageStatus,
} from '../lib/news';
import { cn } from '../lib/utils';

type View = Exclude<ArticleState, 'archived'>;
type Counts = Record<ArticleState, number>;

const VIEWS: { id: View; label: string; empty: string }[] = [
  { id: 'inbox', label: 'Da leggere', empty: 'Niente di nuovo da leggere.' },
  {
    id: 'saved',
    label: 'Selezionati',
    empty: 'Salva le news che vuoi usare per un post: le ritrovi qui.',
  },
  { id: 'discarded', label: 'Scartati', empty: 'Nessun articolo scartato.' },
];

/** With filters on, unscored articles go last in their own group instead of mixing in. */
function orderForDisplay(articles: Article[], filtersActive: boolean): Article[] {
  if (!filtersActive) return articles;
  return [...articles.filter((a) => a.score), ...articles.filter((a) => !a.score)];
}

const VIEW_KEY = 'linkedin-dashboard:news-view';
const FILTERS_KEY = 'linkedin-dashboard:news-filters';

function initialFilters(): ArticleFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable or corrupted */
  }
  return DEFAULT_FILTERS;
}

function initialView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (VIEWS.some((x) => x.id === v)) return v as View;
  } catch {
    /* storage unavailable */
  }
  return 'inbox';
}

type Mode = 'list' | 'graph';
const MODE_KEY = 'linkedin-dashboard:news-mode';

function initialMode(): Mode {
  try {
    if (localStorage.getItem(MODE_KEY) === 'graph') return 'graph';
  } catch {
    /* storage unavailable */
  }
  return 'list';
}

/** Which buttons each view offers, and where each one sends the article. */
const ACTIONS: Record<View, { to: View; label: string; icon: typeof Bookmark }[]> = {
  inbox: [
    { to: 'saved', label: 'Salva', icon: Bookmark },
    { to: 'discarded', label: 'Scarta', icon: X },
  ],
  saved: [
    { to: 'inbox', label: 'Togli dai selezionati', icon: Undo2 },
    { to: 'discarded', label: 'Scarta', icon: X },
  ],
  discarded: [
    { to: 'inbox', label: 'Ripristina', icon: Undo2 },
    { to: 'saved', label: 'Salva', icon: Bookmark },
  ],
};

const MOVED: Record<View, string> = {
  inbox: 'Riportato in Da leggere',
  saved: 'Salvato nei Selezionati',
  discarded: 'Scartato',
};

export function NewsPage({
  onOpenSettings,
  onOpenDraft,
  pillars,
}: {
  onOpenSettings: () => void;
  onOpenDraft: (draftId: number) => void;
  pillars: Pillar[];
}) {
  const [view, setView] = useState<View>(initialView);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [hasFeeds, setHasFeeds] = useState(true);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [filters, setFilters] = useState<ArticleFilters>(initialFilters);
  const [triage, setTriage] = useState<TriageStatus | null>(null);
  /** What the search box shows, and the debounced text actually sent to the server. */
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [openRelated, setOpenRelated] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);

  const changeMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const changeFilters = (f: ArticleFilters) => {
    setFilters(f);
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
    } catch {
      /* storage unavailable */
    }
  };

  const toggleSelected = (id: number) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 5 ? s : [...s, id],
    );

  const load = useCallback(async (v: View, f: ArticleFilters, search: string) => {
    try {
      const [list, c, feeds, st] = await Promise.all([
        api.listArticles({
          state: v,
          sort: f.sort,
          minRelevance: f.minRelevance || undefined,
          pillarId: f.pillarId || undefined,
          feedId: f.feedId ?? undefined,
          postWorthy: f.postWorthyOnly || undefined,
          q: search || undefined,
        }),
        api.articleCounts(),
        api.listFeeds(),
        api.feedStatus(),
      ]);
      setArticles(list);
      setStatus(st);
      setCounts(c);
      setHasFeeds(feeds.length > 0);
      setFeeds(feeds);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load(view, filters, q);
  }, [load, view, filters, q]);

  // While Rizzo Flow works through the backlog, refresh status and scores every few seconds.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const st = await api.triageStatus();
        if (stop) return;
        setTriage((prev) => {
          if (prev && prev.pending !== st.pending) void load(view, filters, q);
          return st;
        });
        timer = setTimeout(tick, st.online && st.pending > 0 ? 8000 : 60000);
      } catch {
        timer = setTimeout(tick, 60000);
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [load, view, filters, q]);

  const changeView = (v: View) => {
    setArticles(null);
    setSelected([]);
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };

  const move = async (article: Article, to: View) => {
    const from = article.state as View;
    setArticles((list) => list?.filter((a) => a.id !== article.id) ?? null);
    setSelected((s) => s.filter((x) => x !== article.id));
    setCounts((c) => (c ? { ...c, [from]: c[from] - 1, [to]: c[to] + 1 } : c));
    try {
      await api.setArticleState(article.id, to);
      toast(MOVED[to], {
        description: article.title,
        action: {
          label: 'Annulla',
          onClick: async () => {
            await api.setArticleState(article.id, from);
            void load(view, filters, q);
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      void load(view, filters, q);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.refreshAllFeeds();
      toast.success(
        `${res.added} nuovi articoli da ${res.refreshed} feed${res.failed ? ` · ${res.failed} con errori` : ''}.`,
      );
      await load(view, filters, q);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const current = VIEWS.find((v) => v.id === view)!;
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-foreground text-2xl font-semibold">News</h1>
          <p className="text-muted-foreground text-sm">
            {counts ? `${counts.inbox} da leggere · ${counts.saved} selezionati` : 'Caricamento…'}
          </p>
          {hasFeeds && (
            <TriageIndicator
              status={triage}
              onRun={async () => {
                try {
                  setTriage(await api.runTriage());
                  await load(view, filters, q);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          )}
          {status && hasFeeds && (
            <p className="text-muted-foreground text-xs">
              {status.running
                ? 'Aggiornamento in corso…'
                : `Si aggiorna da solo ogni 30 minuti · ultimo ${formatRelative(status.lastRunAt)}`}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing || !hasFeeds}>
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          {refreshing ? 'Aggiorno…' : 'Aggiorna ora'}
        </Button>
      </div>

      {!hasFeeds ? (
        <Card className="space-y-3 p-8 text-center">
          <Newspaper className="text-muted-foreground mx-auto size-8" />
          <p className="text-foreground font-medium">Nessuna fonte collegata</p>
          <p className="text-muted-foreground text-sm">
            Aggiungi i siti che segui e le loro news arriveranno qui.
          </p>
          <Button onClick={onOpenSettings}>Aggiungi un feed</Button>
        </Card>
      ) : (
        <>
          <div
            className="bg-secondary inline-flex rounded-lg p-0.5"
            role="tablist"
            aria-label="Modalità"
          >
            {(
              [
                { id: 'list', label: 'Elenco', icon: List },
                { id: 'graph', label: 'Grafo argomenti', icon: Share2 },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => changeMode(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  mode === id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {mode === 'graph' ? (
            <TopicGraphView />
          ) : (
            <>
              <div
                className="bg-secondary inline-flex rounded-lg p-0.5"
                role="tablist"
                aria-label="Viste"
              >
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    aria-selected={view === v.id}
                    onClick={() => changeView(v.id)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      view === v.id
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {v.label}
                    {counts && <span className="text-muted-foreground ml-1.5">{counts[v.id]}</span>}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  type="search"
                  aria-label="Cerca nelle news"
                  placeholder="Cerca nelle news: OpenAI, Taiwan chip, regolamento AI…"
                  className="pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <FiltersBar
                filters={filters}
                onChange={changeFilters}
                pillars={pillars}
                feeds={feeds}
              />

              {view === 'saved' && articles && articles.length > 0 && selected.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Spunta da 1 a 5 news per scriverci un post.
                </p>
              )}

              {articles?.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  {q ? `Nessuna news trovata per «${q}» in questa vista.` : current.empty}
                </p>
              )}

              {articles && articles.length > 0 && (
                <ul className="space-y-3">
                  {orderForDisplay(articles, filtersActive).map((a, i, list) => (
                    <li key={a.id}>
                      {filtersActive && !a.score && (i === 0 || list[i - 1].score) && (
                        <p className="text-muted-foreground pt-2 pb-3 text-xs font-medium">
                          Non ancora valutati da Rizzo Flow: restano visibili qualunque filtro tu
                          usi.
                        </p>
                      )}
                      <Card
                        className={cn(
                          'flex gap-4 p-4',
                          selected.includes(a.id) && 'ring-ring ring-2',
                        )}
                      >
                        {view === 'saved' && (
                          <input
                            type="checkbox"
                            className="accent-primary mt-1 size-4 shrink-0"
                            checked={selected.includes(a.id)}
                            onChange={() => toggleSelected(a.id)}
                            aria-label={`Usa per il post: ${a.title}`}
                            disabled={!selected.includes(a.id) && selected.length >= 5}
                          />
                        )}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="text-muted-foreground text-xs">
                            {a.source} · {formatRelative(a.publishedAt)}
                            {a.author ? ` · ${a.author}` : ''}
                          </p>
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground inline-flex items-start gap-1.5 font-medium hover:underline"
                          >
                            {a.title}
                            <ExternalLink className="text-muted-foreground mt-1 size-3 shrink-0" />
                          </a>
                          {a.snippet && (
                            <p className="text-muted-foreground line-clamp-3 text-sm">
                              {a.snippet}
                            </p>
                          )}
                          <ScoreBadges score={a.score} pillars={pillars} />
                          {openRelated === a.id && (
                            <RelatedArticles
                              articleId={a.id}
                              onSaved={() => void load(view, filters, q)}
                            />
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          {ACTIONS[view].map(({ to, label, icon: Icon }) => (
                            <Button
                              key={to}
                              variant={to === 'saved' ? 'outline' : 'ghost'}
                              size="sm"
                              onClick={() => move(a, to)}
                              aria-label={`${label}: ${a.title}`}
                              title={label}
                            >
                              <Icon className="size-3.5" />
                              <span className="hidden sm:inline">{label}</span>
                            </Button>
                          ))}
                          <Button
                            variant={openRelated === a.id ? 'outline' : 'ghost'}
                            size="sm"
                            onClick={() => setOpenRelated((id) => (id === a.id ? null : a.id))}
                            aria-expanded={openRelated === a.id}
                            aria-label={`News collegate: ${a.title}`}
                            title="News collegate"
                          >
                            <Link2 className="size-3.5" />
                            <span className="hidden sm:inline">Collegate</span>
                          </Button>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}

              {view === 'saved' && selected.length > 0 && (
                <CreatePostPanel
                  articleIds={selected}
                  onClear={() => setSelected([])}
                  onCreated={onOpenDraft}
                  onOpenSettings={onOpenSettings}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
