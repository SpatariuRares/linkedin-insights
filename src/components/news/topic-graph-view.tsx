import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  Bookmark,
  Check,
  ExternalLink,
  Maximize2,
  Minus,
  Plus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '../ui';
import { CreatePostPanel } from './create-post-panel';
import { api } from '../../lib/api';
import { formatRelative, type Feed } from '../../lib/news';
import {
  COLORED_TOPICS,
  feedsByCategory,
  formatViewBox,
  layoutTopicGraph,
  neighbourhood,
  panViewBox,
  parseViewBox,
  topicColor,
  zoomViewBox,
  type TopicGraph,
  type ViewBox,
} from '../../lib/topic-graph';
import { cn } from '../../lib/utils';

const PERIODS = [7, 14, 30, 90];

const METHOD_LABELS: Record<TopicGraph['method'], string> = {
  semantic: 'collegate per significato',
  mixed: 'per significato, e per parole dove l’indicizzazione non è finita',
  keywords: 'collegate per parole dei titoli',
};

const HIDDEN_KEY = 'linkedin-dashboard:graph-hidden-types';

function initialHidden(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Same cap as the Selezionati view: the agent reads at most five sources. */
const MAX_SOURCES = 5;

const selectClass =
  'border-input bg-background focus-visible:ring-ring h-8 rounded-md border px-2 text-xs shadow-sm focus-visible:ring-2 focus-visible:outline-none';

type Node = TopicGraph['nodes'][number];

/**
 * The downloaded news as a map, linked by meaning (or shared headline words) and colored by topic.
 * Up to five of them can be picked straight from here to write a post.
 */
export function TopicGraphView({
  onOpenDraft,
  onOpenSettings,
}: {
  onOpenDraft: (draftId: number) => void;
  onOpenSettings: () => void;
}) {
  const [days, setDays] = useState(14);
  const [archived, setArchived] = useState(false);
  const [graph, setGraph] = useState<TopicGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusTopic, setFocusTopic] = useState<number | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  /** Categories (feed-title prefixes like "AI", "Geo") switched off by the user. */
  const [hidden, setHidden] = useState<string[]>(initialHidden);
  const [view, setView] = useState<ViewBox | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    api.listFeeds().then(setFeeds, () => setFeeds([]));
  }, []);
  const categories = useMemo(() => feedsByCategory(feeds), [feeds]);
  const toggleCategory = (c: string, on: boolean) => {
    const next = on ? [...hidden, c] : hidden.filter((x) => x !== c);
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  const feedIds = useMemo(
    () =>
      hidden.length
        ? [...categories].filter(([c]) => !hidden.includes(c)).flatMap(([, ids]) => ids)
        : undefined,
    [categories, hidden],
  );
  const feedKey = feedIds?.join(',') ?? 'all';

  useEffect(() => {
    let stale = false;
    setGraph(null);
    setError(null);
    setFocusTopic(null);
    setSelected(null);
    setPicked([]);
    api.topicGraph({ days, archived, feedIds }).then(
      (g) => !stale && setGraph(g),
      (err: unknown) => !stale && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      stale = true;
    };
    // feedKey stands for feedIds, whose array identity changes on every render of `categories`
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [days, archived, feedKey]);

  const layout = useMemo(() => (graph ? layoutTopicGraph(graph) : null), [graph]);
  const fit = useMemo(() => (layout ? parseViewBox(layout.viewBox) : null), [layout]);
  /** Zooming in makes view units smaller on screen: labels scale back so they keep their size. */
  const labelScale = view && fit ? view.w / fit.w : 1;
  useEffect(() => setView(fit), [fit]);

  /** Screen point → graph coordinates, honouring the current zoom and letterboxing. */
  const toGraph = (clientX: number, clientY: number) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const pt = el.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse());
  };

  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    setView((v) => {
      if (!v || !fit) return v;
      const at = clientX !== undefined && clientY !== undefined ? toGraph(clientX, clientY) : null;
      const fx = at ? (at.x - v.x) / v.w : 0.5;
      const fy = at ? (at.y - v.y) / v.h : 0.5;
      return zoomViewBox(v, factor, fit, fx, fy);
    });
  };

  // Wheel zoom needs a non-passive listener, or the page would scroll instead.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      zoomBy(Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // zoomBy only reads refs and setState updaters
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  const startDrag = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (ev.button !== 0) return;
    drag.current = { x: ev.clientX, y: ev.clientY, moved: false };
  };
  const moveDrag = (ev: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const ctm = svg.current?.getScreenCTM();
    if (!d || !ctm) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) svg.current?.setPointerCapture(ev.pointerId);
    d.moved = true;
    setHover(null);
    setView((v) => (v ? panViewBox(v, dx, dy, v.w * ctm.a) : v));
    drag.current = { x: ev.clientX, y: ev.clientY, moved: true };
  };
  const endDrag = () => {
    dragged.current = drag.current?.moved ?? false;
    drag.current = null;
  };

  /** Click opens a news; Ctrl/⌘ + click adds it to (or removes it from) the post's sources. */
  const clickNode = (ev: MouseEvent, id: number) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      if (!picked.includes(id) && picked.length >= MAX_SOURCES) {
        toast(`Al massimo ${MAX_SOURCES} news per post.`);
        return;
      }
      togglePicked(id);
      return;
    }
    setSelected(id);
  };
  const byId = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);
  const maxWeight = useMemo(
    () => Math.max(1, ...(graph?.edges.map((e) => e.weight) ?? [])),
    [graph],
  );

  const lit = useMemo(() => {
    if (!graph) return null;
    if (hover) return neighbourhood(graph, hover.id);
    if (focusTopic !== null)
      return new Set(graph.nodes.filter((n) => n.topic === focusTopic).map((n) => n.id));
    return null;
  }, [graph, hover, focusTopic]);

  const save = async (node: Node) => {
    try {
      await api.setArticleState(node.id, 'saved');
      setGraph((g) =>
        g
          ? {
              ...g,
              nodes: g.nodes.map((n) =>
                n.id === node.id ? { ...n, article: { ...n.article, state: 'saved' } } : n,
              ),
            }
          : g,
      );
      toast('Salvato nei Selezionati', { description: node.article.title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePicked = (id: number) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_SOURCES ? p : [...p, id],
    );
  const topicMembers =
    focusTopic === null
      ? []
      : (graph?.nodes ?? [])
          .filter((n) => n.topic === focusTopic)
          .sort((a, b) => b.degree - a.degree || a.id - b.id);

  const topicLabel = (topic: number | null) =>
    topic === null ? 'Senza argomento' : (graph?.topics[topic]?.label ?? '');
  const hovered = hover ? byId.get(hover.id) : undefined;
  const chosen = selected !== null ? byId.get(selected) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="Filtri del grafo">
        <select
          aria-label="Periodo"
          className={selectClass}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {PERIODS.map((d) => (
            <option key={d} value={d}>
              Ultimi {d} giorni
            </option>
          ))}
        </select>
        <label className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="accent-primary size-3.5"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Includi l'archivio
        </label>
        {categories.size > 1 && (
          <div className="inline-flex flex-wrap items-center gap-1" aria-label="Tipo di news">
            <span className="text-muted-foreground text-xs">Tipo:</span>
            {[...categories].map(([c, ids]) => {
              const on = !hidden.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  title={`${ids.length} feed`}
                  onClick={() => toggleCategory(c, on)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    on
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground line-through',
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}
        {graph && (
          <p className="text-muted-foreground text-xs">
            {graph.nodes.length} news collegate in {graph.topics.length} argomenti ·{' '}
            {graph.isolated} senza collegamenti
            {graph.truncated ? ' · solo le 400 più recenti' : ''} · {METHOD_LABELS[graph.method]}
          </p>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!error && !graph && <p className="text-muted-foreground text-sm">Costruisco il grafo…</p>}
      {graph && graph.nodes.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {feedIds && feedIds.length === 0
            ? 'Hai escluso tutti i tipi di news: riattivane almeno uno.'
            : "In questo periodo nessuna news condivide un argomento con un'altra. Prova un periodo più lungo, includi l'archivio o riattiva altri tipi di news."}
        </p>
      )}

      {graph && layout && graph.nodes.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5" aria-label="Argomenti">
            {graph.topics.slice(0, 12).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={focusTopic === t.id}
                onClick={() => setFocusTopic((f) => (f === t.id ? null : t.id))}
                className={cn(
                  'border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  focusTopic === t.id ? 'bg-accent' : 'hover:bg-accent/60',
                  focusTopic !== null && focusTopic !== t.id && 'opacity-50',
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: topicColor(t.id) }}
                />
                {t.label}
                <span className="text-muted-foreground">{t.size}</span>
              </button>
            ))}
          </div>

          <Card className="relative overflow-hidden p-0">
            <div ref={frame} className="relative">
              <svg
                ref={svg}
                viewBox={view ? formatViewBox(view) : layout.viewBox}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="block h-[min(70vh,620px)] w-full touch-none select-none"
                role="img"
                aria-label={`Grafo di ${graph.nodes.length} news in ${graph.topics.length} argomenti`}
                onMouseLeave={() => setHover(null)}
              >
                <g>
                  {graph.edges.map((e) => {
                    const a = layout.nodes.get(e.source)!;
                    const b = layout.nodes.get(e.target)!;
                    const on = !lit || (lit.has(e.source) && lit.has(e.target));
                    return (
                      <line
                        key={`${e.source}-${e.target}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="var(--chart-baseline)"
                        strokeWidth={0.75 + 1.75 * (e.weight / maxWeight)}
                        opacity={on ? 0.9 : 0.12}
                      />
                    );
                  })}
                </g>
                <g>
                  {graph.nodes.map((n) => {
                    const p = layout.nodes.get(n.id)!;
                    const on = !lit || lit.has(n.id);
                    return (
                      <g
                        key={n.id}
                        className="cursor-pointer"
                        opacity={on ? 1 : 0.18}
                        onMouseEnter={(ev) => {
                          const box = frame.current?.getBoundingClientRect();
                          if (box)
                            setHover({
                              id: n.id,
                              x: ev.clientX - box.left,
                              y: ev.clientY - box.top,
                            });
                        }}
                        onClick={(ev) => clickNode(ev, n.id)}
                        onContextMenu={(ev) => {
                          // On a Mac, Ctrl + click is a right click: treat it like ⌘ + click.
                          if (ev.ctrlKey) clickNode(ev, n.id);
                        }}
                      >
                        <circle cx={p.x} cy={p.y} r={p.r + 5} fill="transparent" />
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={p.r}
                          fill={topicColor(n.topic)}
                          stroke={
                            picked.includes(n.id) || selected === n.id
                              ? 'var(--chart-ink)'
                              : 'var(--chart-surface)'
                          }
                          strokeWidth={picked.includes(n.id) ? 3 : 2}
                        />
                      </g>
                    );
                  })}
                </g>
                <g className="pointer-events-none">
                  {graph.topics.slice(0, COLORED_TOPICS).map((t) => {
                    const at = layout.labels.get(t.id);
                    if (!at) return null;
                    const dim = lit !== null && focusTopic !== null && focusTopic !== t.id;
                    return (
                      <text
                        key={t.id}
                        x={at.x}
                        y={at.y - 16 * labelScale}
                        textAnchor="middle"
                        fontSize={12 * labelScale}
                        fontWeight={600}
                        fill="var(--chart-ink)"
                        stroke="var(--chart-surface)"
                        strokeWidth={4 * labelScale}
                        paintOrder="stroke"
                        opacity={dim ? 0.25 : 1}
                      >
                        {t.label}
                      </text>
                    );
                  })}
                </g>
              </svg>
              <div className="absolute top-2 right-2 flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => zoomBy(1.4)}
                  aria-label="Ingrandisci"
                  title="Ingrandisci"
                >
                  <ZoomIn className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => zoomBy(1 / 1.4)}
                  aria-label="Riduci"
                  title="Riduci"
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setView(fit)}
                  aria-label="Adatta il grafo alla finestra"
                  title="Adatta"
                >
                  <Maximize2 className="size-3.5" />
                </Button>
              </div>
              {hovered && hover && (
                <div
                  className="bg-popover text-popover-foreground border-border pointer-events-none absolute z-10 max-w-xs rounded-md border px-3 py-2 text-xs shadow-md"
                  style={{
                    left: Math.min(hover.x + 12, (frame.current?.clientWidth ?? 0) - 260),
                    top: hover.y + 12,
                  }}
                >
                  <p className="text-foreground font-medium">{hovered.article.title}</p>
                  <p className="text-muted-foreground mt-1">
                    {hovered.article.source} · {formatRelative(hovered.article.publishedAt)}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {topicLabel(hovered.topic)} · {hovered.degree} collegamenti
                  </p>
                </div>
              )}
            </div>
          </Card>

          {picked.length > 0 && (
            <CreatePostPanel
              articleIds={picked}
              onClear={() => setPicked([])}
              onCreated={onOpenDraft}
              onOpenSettings={onOpenSettings}
              sticky={false}
            />
          )}

          {focusTopic !== null && topicMembers.length > 0 && (
            <Card className="space-y-3 p-4">
              <div>
                <p className="text-foreground text-sm font-medium">
                  Scrivi un post su «{topicLabel(focusTopic)}»
                </p>
                <p className="text-muted-foreground text-xs">
                  Spunta da 1 a {MAX_SOURCES} news da dare all&apos;agente come fonti. Puoi
                  aggiungerne anche da altri argomenti con Ctrl + clic nel grafo.
                </p>
              </div>
              <ul className="space-y-2">
                {topicMembers.map((n) => {
                  const on = picked.includes(n.id);
                  return (
                    <li key={n.id} className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="accent-primary mt-1 size-4 shrink-0"
                        checked={on}
                        disabled={!on && picked.length >= MAX_SOURCES}
                        onChange={() => togglePicked(n.id)}
                        aria-label={`Usa per il post: ${n.article.title}`}
                      />
                      <div className="min-w-0">
                        <a
                          href={n.article.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground text-sm hover:underline"
                        >
                          {n.article.title}
                        </a>
                        <p className="text-muted-foreground text-xs">
                          {n.article.source} · {formatRelative(n.article.publishedAt)} · {n.degree}{' '}
                          collegamenti
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {chosen ? (
            <Card className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 space-y-1">
                <p className="text-muted-foreground text-xs">
                  {chosen.article.source} · {formatRelative(chosen.article.publishedAt)} ·{' '}
                  {topicLabel(chosen.topic)}
                </p>
                <a
                  href={chosen.article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground inline-flex items-start gap-1.5 font-medium hover:underline"
                >
                  {chosen.article.title}
                  <ExternalLink className="text-muted-foreground mt-1 size-3 shrink-0" />
                </a>
                {chosen.article.snippet && (
                  <p className="text-muted-foreground line-clamp-3 text-sm">
                    {chosen.article.snippet}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Button
                  variant={picked.includes(chosen.id) ? 'ghost' : 'default'}
                  size="sm"
                  onClick={() => togglePicked(chosen.id)}
                  disabled={!picked.includes(chosen.id) && picked.length >= MAX_SOURCES}
                >
                  {picked.includes(chosen.id) ? (
                    <Minus className="size-3.5" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  {picked.includes(chosen.id) ? 'Togli dal post' : 'Usa per il post'}
                </Button>
                {chosen.article.state === 'saved' ? (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    <Check className="size-3.5" />
                    Salvato
                  </span>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => save(chosen)}>
                    <Bookmark className="size-3.5" />
                    Salva
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <p className="text-muted-foreground text-xs">
              Passa sopra un punto per vedere la news e i suoi collegamenti, cliccalo per aprirla.
              Clicca un argomento per evidenziarlo e scegliere le news per un post. Ctrl + clic (⌘ +
              clic su Mac) su un punto lo aggiunge alle fonti del post. Rotellina per lo zoom,
              trascina per spostarti.
            </p>
          )}

          <section className="space-y-2" aria-label="Elenco degli argomenti">
            <h2 className="text-foreground text-sm font-medium">Tutti gli argomenti</h2>
            {graph.topics.map((t) => (
              <details key={t.id} className="border-border rounded-lg border px-3 py-2">
                <summary className="text-foreground flex cursor-pointer items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: topicColor(t.id) }}
                  />
                  {t.label}
                  <span className="text-muted-foreground text-xs">{t.size} news</span>
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {graph.nodes
                    .filter((n) => n.topic === t.id)
                    .map((n) => (
                      <li key={n.id} className="text-sm">
                        <a
                          href={n.article.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground hover:underline"
                        >
                          {n.article.title}
                        </a>
                        <span className="text-muted-foreground text-xs">
                          {' '}
                          · {n.article.source} · {formatRelative(n.article.publishedAt)}
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
