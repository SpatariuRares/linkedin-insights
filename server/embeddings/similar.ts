/**
 * Similarity over unit vectors (see `embedTexts`), so cosine is a plain dot product. Thresholds
 * were measured with baai/bge-m3 on news headlines: the same story in English and Italian scores
 * 0.8-0.93, the same event from another outlet ~0.58, a shared broad theme ~0.33 and unrelated
 * news 0.25-0.32.
 */

/** Below this, two articles are not about the same story. */
export const RELATED_MIN = 0.5;
/** Graph links need a little more, so topics stay tight. */
export const GRAPH_MIN = 0.6;

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** The `k` vectors most similar to `target` and at least `min` similar, best first. */
export function nearest(
  target: { id: number; vector: Float32Array },
  candidates: Map<number, Float32Array>,
  { k, min }: { k: number; min: number },
): { id: number; similarity: number }[] {
  const scored: { id: number; similarity: number }[] = [];
  for (const [id, vector] of candidates) {
    if (id === target.id || vector.length !== target.vector.length) continue;
    const similarity = cosine(target.vector, vector);
    if (similarity >= min) scored.push({ id, similarity });
  }
  return scored.sort((a, b) => b.similarity - a.similarity || a.id - b.id).slice(0, k);
}

/**
 * Each article linked to its `k` nearest neighbours above `min`; a pair found from either side is
 * one edge. Returned in a stable order so the graph built on top is deterministic.
 */
export function semanticEdges(
  vectors: Map<number, Float32Array>,
  { k, min }: { k: number; min: number },
): { a: number; b: number; similarity: number }[] {
  const edges = new Map<string, { a: number; b: number; similarity: number }>();
  for (const [id, vector] of vectors) {
    for (const n of nearest({ id, vector }, vectors, { k, min })) {
      const [a, b] = id < n.id ? [id, n.id] : [n.id, id];
      edges.set(`${a}-${b}`, { a, b, similarity: n.similarity });
    }
  }
  return [...edges.values()].sort((p, q) => q.similarity - p.similarity || p.a - q.a || p.b - q.b);
}
