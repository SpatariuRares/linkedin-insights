import { describe, expect, it } from 'vitest';
import {
  feedCategory,
  feedsByCategory,
  formatViewBox,
  layoutTopicGraph,
  neighbourhood,
  panViewBox,
  parseViewBox,
  topicColor,
  viewBoxFor,
  zoomViewBox,
} from './topic-graph';

const node = (id: number, topic: number | null) => ({ id, topic, degree: 2 });

// two triangles: 1-2-3 (topic 0) and 4-5-6 (topic 1)
const GRAPH = {
  nodes: [node(1, 0), node(2, 0), node(3, 0), node(4, 1), node(5, 1), node(6, 1)],
  edges: [
    { source: 1, target: 2, weight: 3, shared: [] },
    { source: 2, target: 3, weight: 3, shared: [] },
    { source: 1, target: 3, weight: 3, shared: [] },
    { source: 4, target: 5, weight: 3, shared: [] },
    { source: 5, target: 6, weight: 3, shared: [] },
    { source: 4, target: 6, weight: 3, shared: [] },
  ],
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('layoutTopicGraph', () => {
  it('places linked articles closer together than unlinked ones', () => {
    const { nodes } = layoutTopicGraph(GRAPH as never);
    const p = (id: number) => nodes.get(id)!;
    expect(dist(p(1), p(2))).toBeLessThan(dist(p(1), p(4)));
    expect(dist(p(5), p(6))).toBeLessThan(dist(p(3), p(6)));
  });

  it('is deterministic and puts a label at each topic centre', () => {
    const a = layoutTopicGraph(GRAPH as never);
    const b = layoutTopicGraph(GRAPH as never);
    expect([...a.nodes.values()]).toEqual([...b.nodes.values()]);
    expect([...a.labels.keys()].sort()).toEqual([0, 1]);
    expect(a.viewBox).toMatch(/^-?\d+ -?\d+ \d+ \d+$/);
  });
});

describe('helpers', () => {
  it('colors the first eight topics from the palette and the rest neutral', () => {
    expect(topicColor(0)).toBe('var(--series-1)');
    expect(topicColor(7)).toBe('var(--series-8)');
    expect(topicColor(8)).toBe('var(--chart-ink-muted)');
    expect(topicColor(null)).toBe('var(--chart-ink-muted)');
  });

  it('fits the view box around every node plus padding', () => {
    expect(viewBoxFor([{ id: 1, x: 0, y: 0, r: 5 }], 10)).toBe('-15 -15 30 30');
  });

  it('finds an article with its direct links', () => {
    expect([...neighbourhood(GRAPH, 2)].sort()).toEqual([1, 2, 3]);
  });
});

describe('feed categories', () => {
  it('reads the category from the feed title prefix', () => {
    expect(feedCategory('AI · Simon Willison')).toBe('AI');
    expect(feedCategory('Geo · Il Post Mondo')).toBe('Geo');
    expect(feedCategory('Il Post')).toBe('Altro');
  });

  it('groups feeds by category, Altro last', () => {
    const groups = feedsByCategory([
      { id: 1, title: 'Tech · Ars' },
      { id: 2, title: 'Blog senza prefisso' },
      { id: 3, title: 'AI · OpenAI' },
      { id: 4, title: 'AI · Google' },
    ]);
    expect([...groups]).toEqual([
      ['AI', [3, 4]],
      ['Tech', [1]],
      ['Altro', [2]],
    ]);
  });
});

describe('zoom and pan', () => {
  const fit = { x: 0, y: 0, w: 100, h: 50 };

  it('zooms around the given point and keeps the aspect ratio', () => {
    expect(zoomViewBox(fit, 2, fit)).toEqual({ x: 25, y: 12.5, w: 50, h: 25 });
    expect(zoomViewBox(fit, 2, fit, 0, 0)).toEqual({ x: 0, y: 0, w: 50, h: 25 });
  });

  it('stops at 8x in and 4x out', () => {
    expect(zoomViewBox(fit, 100, fit).w).toBe(12.5);
    expect(zoomViewBox(fit, 0.01, fit).w).toBe(400);
  });

  it('pans by screen pixels converted to view units', () => {
    expect(panViewBox(fit, 10, -20, 200)).toEqual({ x: -5, y: 10, w: 100, h: 50 });
  });

  it('round-trips a view box string', () => {
    expect(formatViewBox(parseViewBox('-15 -15 30 30'))).toBe('-15 -15 30 30');
  });
});
