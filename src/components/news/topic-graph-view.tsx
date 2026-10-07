import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '../ui';
import { api } from '../../lib/api';
import { formatRelative } from '../../lib/news';
import {
  COLORED_TOPICS,
  layoutTopicGraph,
  neighbourhood,
  topicColor,
  type TopicGraph,
} from '../../lib/topic-graph';
import { cn } from '../../lib/utils';

const PERIODS = [7, 14, 30, 90];

const selectClass =
  'border-input bg-background focus-visible:ring-ring h-8 rounded-md border px-2 text-xs shadow-sm focus-visible:ring-2 focus-visible:outline-none';

type Node = TopicGraph['nodes'][number];

/** The downloaded news as a map: linked when headlines share distinctive words, colored by topic. */
export function TopicGraphView() {
  const [days, setDays] = useState(14);
  const [archived, setArchived] = useState(false);
  const [graph, setGraph] = useState<TopicGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusTopic, setFocusTopic] = useState<number | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stale = false;
    setGraph(null);
    setError(null);
    setFocusTopic(null);
    setSelected(null);
    api.topicGraph({ days, archived }).then(
      (g) => !stale && setGraph(g),
      (err: unknown) => !stale && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      stale = true;
    };
  }, [days, archived]);

  const layout = useMemo(() => (graph ? layoutTopicGraph(graph) : null), [graph]);
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
        {graph && (
          <p className="text-muted-foreground text-xs">
            {graph.nodes.length} news collegate in {graph.topics.length} argomenti ·{' '}
            {graph.isolated} senza collegamenti
            {graph.truncated ? ' · solo le 400 più recenti' : ''}
          </p>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!error && !graph && <p className="text-muted-foreground text-sm">Costruisco il grafo…</p>}
      {graph && graph.nodes.length === 0 && (
        <p className="text-muted-foreground text-sm">
          In questo periodo nessuna news condivide un argomento con un'altra. Prova un periodo più
          lungo o includi l'archivio.
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
                viewBox={layout.viewBox}
                className="block h-[min(70vh,620px)] w-full"
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
                        onClick={() => setSelected(n.id)}
                      >
                        <circle cx={p.x} cy={p.y} r={p.r + 5} fill="transparent" />
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={p.r}
                          fill={topicColor(n.topic)}
                          stroke={selected === n.id ? 'var(--chart-ink)' : 'var(--chart-surface)'}
                          strokeWidth={2}
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
                        y={at.y - 16}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={600}
                        fill="var(--chart-ink)"
                        stroke="var(--chart-surface)"
                        strokeWidth={4}
                        paintOrder="stroke"
                        opacity={dim ? 0.25 : 1}
                      >
                        {t.label}
                      </text>
                    );
                  })}
                </g>
              </svg>
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
              {chosen.article.state === 'saved' ? (
                <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
                  <Check className="size-3.5" />
                  Salvato
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => save(chosen)}>
                  <Bookmark className="size-3.5" />
                  Salva
                </Button>
              )}
            </Card>
          ) : (
            <p className="text-muted-foreground text-xs">
              Passa sopra un punto per vedere la news e i suoi collegamenti, cliccalo per aprirla.
              Clicca un argomento per evidenziarlo.
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
