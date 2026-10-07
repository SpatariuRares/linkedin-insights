// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cosine, nearest, semanticEdges } from './similar.ts';

const v = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return Float32Array.from(xs, (x) => x / n);
};

describe('similarity', () => {
  it('is the dot product of unit vectors', () => {
    expect(cosine(v(1, 0), v(1, 0))).toBeCloseTo(1);
    expect(cosine(v(1, 0), v(0, 1))).toBeCloseTo(0);
  });

  it('finds the nearest vectors above a threshold, best first, never the article itself', () => {
    const all = new Map([
      [1, v(1, 0)],
      [2, v(1, 0.1)],
      [3, v(1, 1)],
      [4, v(0, 1)],
    ]);
    const found = nearest({ id: 1, vector: all.get(1)! }, all, { k: 5, min: 0.5 });
    expect(found.map((f) => f.id)).toEqual([2, 3]);
    expect(nearest({ id: 1, vector: all.get(1)! }, all, { k: 1, min: 0 }).map((f) => f.id)).toEqual(
      [2],
    );
  });

  it('turns nearest neighbours into one edge per pair', () => {
    const all = new Map([
      [1, v(1, 0)],
      [2, v(1, 0.1)],
      [3, v(0, 1)],
    ]);
    expect(semanticEdges(all, { k: 2, min: 0.5 })).toEqual([
      { a: 1, b: 2, similarity: expect.closeTo(0.995, 3) },
    ]);
  });
});
