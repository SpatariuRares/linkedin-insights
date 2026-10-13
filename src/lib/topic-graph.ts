import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { Article } from './news';

/** Shape of GET /api/articles/graph. */
export type TopicGraph = {
  nodes: { id: number; topic: number | null; degree: number; article: Article }[];
  edges: {
    source: number;
    target: number;
    weight: number;
    shared: string[];
    kind: 'semantic' | 'keywords';
  }[];
  topics: { id: number; label: string; terms: string[]; size: number }[];
  isolated: number;
  total: number;
  truncated: boolean;
  method: 'semantic' | 'keywords' | 'mixed';
};

/** Topics past the eighth share one neutral color: the palette has eight validated hues. */
export const COLORED_TOPICS = 8;

export function topicColor(topic: number | null): string {
  return topic !== null && topic < COLORED_TOPICS
    ? `var(--series-${topic + 1})`
    : 'var(--chart-ink-muted)';
}

export const nodeRadius = (degree: number) => 4 + Math.min(degree, 6);

export type Positioned = { id: number; x: number; y: number; r: number };

export type GraphLayout = {
  nodes: Map<number, Positioned>;
  /** Where each topic's direct label goes: the centroid of its articles. */
  labels: Map<number, { x: number; y: number }>;
  viewBox: string;
};

/** Same seed, same picture: d3 only draws on randomness to separate coincident nodes. */
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type SimNode = SimulationNodeDatum & { id: number; r: number };

/**
 * Force layout computed up front (no animation): links pull an article towards the ones it shares
 * words with, stronger links pull harder, and a weak pull to the centre keeps separate topics in
 * one frame instead of drifting apart.
 */
export function layoutTopicGraph(graph: Pick<TopicGraph, 'nodes' | 'edges'>): GraphLayout {
  const nodes: SimNode[] = graph.nodes.map((n) => ({ id: n.id, r: nodeRadius(n.degree) }));
  const maxWeight = Math.max(1, ...graph.edges.map((e) => e.weight));
  const links: (SimulationLinkDatum<SimNode> & { weight: number })[] = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));

  const sim = forceSimulation(nodes)
    .randomSource(seeded())
    .force(
      'link',
      forceLink<SimNode, (typeof links)[number]>(links)
        .id((d) => d.id)
        .distance(36)
        .strength((l) => 0.3 + 0.7 * (l.weight / maxWeight)),
    )
    .force('charge', forceManyBody().strength(-45))
    .force(
      'collide',
      forceCollide<SimNode>((d) => d.r + 3),
    )
    .force('x', forceX(0).strength(0.06))
    .force('y', forceY(0).strength(0.06))
    .stop();
  sim.tick(300);

  const positioned = new Map(
    nodes.map((n) => [n.id, { id: n.id, x: n.x ?? 0, y: n.y ?? 0, r: n.r }] as const),
  );

  const sums = new Map<number, { x: number; y: number; n: number }>();
  for (const node of graph.nodes) {
    if (node.topic === null) continue;
    const p = positioned.get(node.id)!;
    const s = sums.get(node.topic) ?? { x: 0, y: 0, n: 0 };
    sums.set(node.topic, { x: s.x + p.x, y: s.y + p.y, n: s.n + 1 });
  }
  const labels = new Map([...sums].map(([t, s]) => [t, { x: s.x / s.n, y: s.y / s.n }] as const));

  return { nodes: positioned, labels, viewBox: viewBoxFor([...positioned.values()]) };
}

/** A viewBox that fits every node, with room around the edge for labels. */
export function viewBoxFor(points: Positioned[], padding = 60): string {
  if (!points.length) return '-100 -100 200 200';
  const xs = points.flatMap((p) => [p.x - p.r, p.x + p.r]);
  const ys = points.flatMap((p) => [p.y - p.r, p.y + p.r]);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const w = Math.max(...xs) + padding - minX;
  const h = Math.max(...ys) + padding - minY;
  return [minX, minY, w, h].map((v) => Math.round(v)).join(' ');
}

/** The article and every article linked to it, for hover highlighting. */
export function neighbourhood(
  graph: { edges: { source: number; target: number }[] },
  id: number,
): Set<number> {
  const ids = new Set([id]);
  for (const e of graph.edges) {
    if (e.source === id) ids.add(e.target);
    if (e.target === id) ids.add(e.source);
  }
  return ids;
}

/** "AI · Simon Willison" → "AI": the category is the prefix the feed's title starts with. */
export function feedCategory(title: string): string {
  const m = title.match(/^([^·]{1,20}?)\s*·\s/);
  return m ? m[1].trim() : 'Altro';
}

/** Feed ids by category, categories in alphabetical order with "Altro" last. */
export function feedsByCategory(feeds: { id: number; title: string }[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const f of feeds) {
    const c = feedCategory(f.title);
    groups.set(c, [...(groups.get(c) ?? []), f.id]);
  }
  return new Map(
    [...groups].sort(([a], [b]) => (a === 'Altro' ? 1 : b === 'Altro' ? -1 : a.localeCompare(b))),
  );
}

export type ViewBox = { x: number; y: number; w: number; h: number };

export function parseViewBox(vb: string): ViewBox {
  const [x, y, w, h] = vb.split(' ').map(Number);
  return { x, y, w, h };
}

export const formatViewBox = (v: ViewBox) => `${v.x} ${v.y} ${v.w} ${v.h}`;

/**
 * Zooms by `factor` (>1 = closer) keeping the point at fractional position (fx, fy) of the view
 * still, so wheel-zoom follows the mouse. Clamped between 8x in and 4x out of `fit`.
 */
export function zoomViewBox(v: ViewBox, factor: number, fit: ViewBox, fx = 0.5, fy = 0.5): ViewBox {
  const w = Math.min(fit.w * 4, Math.max(fit.w / 8, v.w / factor));
  const h = (w / v.w) * v.h;
  return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
}

/** Moves the view by a drag of (dx, dy) screen pixels on an element `width` pixels wide. */
export function panViewBox(v: ViewBox, dx: number, dy: number, width: number): ViewBox {
  const scale = v.w / width;
  return { ...v, x: v.x - dx * scale, y: v.y - dy * scale };
}
