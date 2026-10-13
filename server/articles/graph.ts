import { relatedTerms } from './search.ts';
import { GRAPH_MIN, semanticEdges } from '../embeddings/similar.ts';

export type TopicGraph = {
  /** Only articles linked to at least one other; `topic` is null when their group is a pair-less stray. */
  nodes: { id: number; topic: number | null; degree: number }[];
  edges: {
    source: number;
    target: number;
    weight: number;
    /** Headline words both share; may be empty for a link by meaning across languages. */
    shared: string[];
    kind: 'semantic' | 'keywords';
  }[];
  /** Largest first; `id` is the topic's index in this array. */
  topics: { id: number; label: string; terms: string[]; size: number }[];
  /** Articles left out because they share nothing distinctive with the others. */
  isolated: number;
  /** How the links were found: by meaning, by shared words, or both (some articles not embedded). */
  method: 'semantic' | 'keywords' | 'mixed';
};

type Options = {
  maxEdgesPerNode?: number;
  maxLabelTerms?: number;
  /** Article embeddings (unit vectors); articles with one are linked by meaning. */
  vectors?: Map<number, Float32Array>;
  minSimilarity?: number;
};

const shorten = (title: string, max = 48) =>
  title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;

/** Folds plurals and derived forms together: "exports"/"export", "taiwanese"/"taiwan". */
const keyOf = (word: string) => (word.length > 6 ? word.slice(0, 6) : word);

/**
 * Links articles whose headlines share at least two distinctive words, weighting each shared word
 * by how rare it is in this set (a shared "Taiwan" says more than a shared "China"), keeps only each
 * article's strongest links, and groups the result into topics by weighted label propagation.
 * Deterministic: same input, same graph.
 */
export function buildTopicGraph(
  articles: { id: number; title: string }[],
  { maxEdgesPerNode = 4, maxLabelTerms = 3, vectors, minSimilarity = GRAPH_MIN }: Options = {},
): TopicGraph {
  const n = articles.length;
  const embedded = articles.map((a) => vectors?.has(a.id) ?? false);
  const embeddedCount = embedded.filter(Boolean).length;
  const method = embeddedCount === 0 ? 'keywords' : embeddedCount === n ? 'semantic' : 'mixed';
  if (n === 0) return { nodes: [], edges: [], topics: [], isolated: 0, method: 'keywords' };

  // Distinctive keys per article, and the commonest surface form of each key for labels.
  const forms = new Map<string, Map<string, number>>();
  const keys = articles.map((a) => {
    const set = new Set<string>();
    for (const word of relatedTerms(a.title)) {
      const key = keyOf(word);
      set.add(key);
      const f = forms.get(key) ?? new Map<string, number>();
      f.set(word, (f.get(word) ?? 0) + 1);
      forms.set(key, f);
    }
    return set;
  });
  const display = (key: string) =>
    [...forms.get(key)!.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  const postings = new Map<string, number[]>();
  keys.forEach((set, i) => {
    for (const k of set) postings.set(k, [...(postings.get(k) ?? []), i]);
  });
  const idf = (k: string) => Math.log((n + 1) / postings.get(k)!.length);

  // Candidate pairs through the inverted index: only keys found in 2+ articles can link anything.
  const shared = new Map<number, string[]>();
  for (const [k, list] of postings) {
    if (list.length < 2) continue;
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const pair = list[x] * n + list[y];
        shared.set(pair, [...(shared.get(pair) ?? []), k]);
      }
    }
  }
  type Candidate = {
    a: number;
    b: number;
    weight: number;
    shared: string[];
    kind: 'semantic' | 'keywords';
  };
  // Shared words link a pair only when meaning cannot: at least one of the two has no vector.
  const keyword: Candidate[] = [];
  for (const [pair, ks] of shared) {
    const a = Math.floor(pair / n);
    const b = pair % n;
    if (ks.length < 2 || (embedded[a] && embedded[b])) continue;
    const weight = ks.reduce((sum, k) => sum + idf(k), 0);
    keyword.push({ a, b, weight, shared: ks.sort(), kind: 'keywords' });
  }

  const semantic: Candidate[] = [];
  if (embeddedCount > 1) {
    const indexOf = new Map(articles.map((a, i) => [a.id, i]));
    const own = new Map(
      articles.filter((_, i) => embedded[i]).map((a) => [a.id, vectors!.get(a.id)!]),
    );
    for (const e of semanticEdges(own, { k: maxEdgesPerNode, min: minSimilarity })) {
      const [a, b] = [indexOf.get(e.a)!, indexOf.get(e.b)!].sort((x, y) => x - y);
      semantic.push({
        a,
        b,
        weight: e.similarity,
        shared: (shared.get(a * n + b) ?? []).sort(),
        kind: 'semantic',
      });
    }
  }

  // In a mixed graph, word-based links are rescaled into the similarity range so the two compare.
  if (semantic.length && keyword.length) {
    const top = Math.max(...keyword.map((c) => c.weight));
    for (const c of keyword) c.weight = minSimilarity + 0.2 * (c.weight / top);
  }
  const candidates = [...semantic, ...keyword].sort(
    (p, q) => q.weight - p.weight || p.a - q.a || p.b - q.b,
  );

  // Each article keeps its strongest links; a link survives if either end keeps it.
  const kept = new Set<number>();
  const taken = new Array<number>(n).fill(0);
  candidates.forEach((c, i) => {
    if (taken[c.a] < maxEdgesPerNode || taken[c.b] < maxEdgesPerNode) {
      kept.add(i);
      taken[c.a]++;
      taken[c.b]++;
    }
  });
  const edges = candidates.filter((_, i) => kept.has(i));

  const neighbours = articles.map(() => [] as { j: number; w: number }[]);
  for (const e of edges) {
    neighbours[e.a].push({ j: e.b, w: e.weight });
    neighbours[e.b].push({ j: e.a, w: e.weight });
  }

  // Weighted label propagation; ties keep the current label, else go to the smallest one.
  const label = articles.map((_, i) => i);
  for (let round = 0; round < 30; round++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (!neighbours[i].length) continue;
      const score = new Map<number, number>();
      for (const { j, w } of neighbours[i]) score.set(label[j], (score.get(label[j]) ?? 0) + w);
      const best = Math.max(...score.values());
      if ((score.get(label[i]) ?? 0) >= best - 1e-9) continue;
      const next = Math.min(...[...score].filter(([, s]) => s >= best - 1e-9).map(([l]) => l));
      label[i] = next;
      changed = true;
    }
    if (!changed) break;
  }

  const groups = new Map<number, number[]>();
  articles.forEach((_, i) => {
    if (neighbours[i].length) groups.set(label[i], [...(groups.get(label[i]) ?? []), i]);
  });
  const ordered = [...groups.values()]
    .filter((members) => members.length >= 2)
    .sort((p, q) => q.length - p.length || p[0] - q[0]);

  const topicOf = new Map<number, number>();
  const topics = ordered.map((members, id) => {
    members.forEach((i) => topicOf.set(i, id));
    const count = new Map<string, number>();
    for (const i of members) for (const k of keys[i]) count.set(k, (count.get(k) ?? 0) + 1);
    const terms = [...count]
      .filter(([, c]) => c >= 2)
      .sort((p, q) => q[1] - p[1] || idf(q[0]) - idf(p[0]) || p[0].localeCompare(q[0]))
      .slice(0, maxLabelTerms)
      .map(([k]) => display(k));
    // Linked by meaning across languages, a topic may share no word at all: name it after its
    // most connected article instead.
    const label = terms.length
      ? terms.join(' · ')
      : shorten(
          articles[
            members.reduce((best, i) => (neighbours[i].length > neighbours[best].length ? i : best))
          ].title,
        );
    return { id, label, terms, size: members.length };
  });

  const nodes = articles.flatMap((a, i) =>
    neighbours[i].length
      ? [{ id: a.id, topic: topicOf.get(i) ?? null, degree: neighbours[i].length }]
      : [],
  );
  return {
    nodes,
    edges: edges.map((e) => ({
      source: articles[e.a].id,
      target: articles[e.b].id,
      weight: Math.round(e.weight * 100) / 100,
      shared: e.shared.map(display),
      kind: e.kind,
    })),
    topics,
    isolated: n - nodes.length,
    method,
  };
}
