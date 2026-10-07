// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildTopicGraph } from './graph.ts';

const titles = [
  'Taiwan chip exports to China face new limits', // 1
  'China answers Taiwan chip export limits', // 2
  'Taiwanese chipmakers weigh China exports', // 3
  'OpenAI launches GPT model for developers', // 4
  'Developers test the OpenAI GPT model', // 5
  'GPT model from OpenAI tops benchmarks', // 6
  'A recipe for sourdough bread', // 7
];
const articles = titles.map((title, i) => ({ id: i + 1, title }));

describe('buildTopicGraph', () => {
  it('links articles that share distinctive headline words and groups them into topics', () => {
    const graph = buildTopicGraph(articles);
    expect(graph.topics).toHaveLength(2);
    const topicOf = (id: number) => graph.nodes.find((n) => n.id === id)?.topic;
    expect(new Set([1, 2, 3].map(topicOf)).size).toBe(1);
    expect(new Set([4, 5, 6].map(topicOf)).size).toBe(1);
    expect(topicOf(1)).not.toBe(topicOf(4));
  });

  it('labels a topic with the words its articles share most, in their original form', () => {
    const { topics } = buildTopicGraph(articles);
    const labels = topics.map((t) => t.terms);
    expect(labels).toContainEqual(expect.arrayContaining(['openai', 'gpt', 'model']));
    expect(labels.flat()).toContain('taiwan');
    expect(topics.every((t) => t.size === 3)).toBe(true);
  });

  it('leaves out articles with nothing in common and reports how many', () => {
    const graph = buildTopicGraph(articles);
    expect(graph.nodes.map((n) => n.id)).not.toContain(7);
    expect(graph.isolated).toBe(1);
  });

  it('keeps edges between distinct articles, each with the shared words', () => {
    const { edges } = buildTopicGraph(articles);
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) {
      expect(e.source).not.toBe(e.target);
      expect(e.shared.length).toBeGreaterThanOrEqual(2);
      expect(e.weight).toBeGreaterThan(0);
    }
  });

  it('caps the edges each article keeps, so big topics do not become a hairball', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      title: `Nvidia chip ban story number ${'abcdefghijkl'[i]}`,
    }));
    const { edges, nodes } = buildTopicGraph(many, { maxEdgesPerNode: 3 });
    const degree = new Map<number, number>();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    expect(nodes).toHaveLength(12);
    // an article keeps its own 3 best edges, plus those where it is someone else's best
    expect(edges.length).toBeLessThanOrEqual(12 * 3);
    expect(edges.length).toBeLessThan((12 * 11) / 2);
  });

  it('returns an empty graph for no articles', () => {
    expect(buildTopicGraph([])).toEqual({
      nodes: [],
      edges: [],
      topics: [],
      isolated: 0,
      method: 'keywords',
    });
  });
});

/** Unit vector pointing mostly along `axis`, nudged by `tilt` so neighbours differ a little. */
function vec(axis: number, tilt = 0): Float32Array {
  const v = new Float32Array(4);
  v[axis] = 1;
  v[(axis + 1) % 4] = tilt;
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

describe('buildTopicGraph with embeddings', () => {
  const multilingual = [
    { id: 1, title: 'Ukraine says Russia bombed apartment block' },
    { id: 2, title: "L'Ucraina accusa Mosca: missili su un condominio" },
    { id: 3, title: 'Kyiv residential building hit overnight' },
    { id: 4, title: 'OpenAI lancia un nuovo modello' },
    { id: 5, title: 'OpenAI lancia il modello per sviluppatori' },
    { id: 6, title: 'A recipe for sourdough bread' },
  ];
  const vectors = new Map([
    [1, vec(0)],
    [2, vec(0, 0.2)],
    [3, vec(0, 0.4)],
    [4, vec(1)],
    [5, vec(1, 0.2)],
    [6, vec(3)],
  ]);

  it('links by meaning, across languages and without shared words', () => {
    const graph = buildTopicGraph(multilingual, { vectors });
    expect(graph.method).toBe('semantic');
    const topicOf = (id: number) => graph.nodes.find((n) => n.id === id)?.topic;
    expect(topicOf(1)).toBe(topicOf(2));
    expect(topicOf(2)).toBe(topicOf(3));
    expect(topicOf(4)).toBe(topicOf(5));
    expect(topicOf(1)).not.toBe(topicOf(4));
    expect(graph.nodes.map((n) => n.id)).not.toContain(6);
    expect(graph.edges.every((e) => e.kind === 'semantic')).toBe(true);
  });

  it('falls back to shared words for articles that have no vector yet', () => {
    const partial = new Map([...vectors].filter(([id]) => id !== 5));
    const graph = buildTopicGraph(multilingual, { vectors: partial });
    expect(graph.method).toBe('mixed');
    const link = graph.edges.find((e) => [e.source, e.target].sort().join() === '4,5');
    expect(link).toMatchObject({ kind: 'keywords' });
  });
});
