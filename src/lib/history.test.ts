import { describe, expect, it } from 'vitest';
import { emptyHistory, mergeExport, rankedPosts } from './history';
import type { LinkedInExport } from './linkedin-export';

function exportOf(partial: Partial<LinkedInExport>): LinkedInExport {
  return {
    rangeLabel: null,
    impressions: null,
    membersReached: null,
    totalFollowers: null,
    totalFollowersAsOf: null,
    engagement: [],
    followers: [],
    topByEngagement: [],
    topByImpressions: [],
    demographics: [],
    ...partial,
  };
}

const meta = (fileName: string) => ({ fileName, importedAt: '2026-10-06T10:00:00.000Z' });

describe('mergeExport', () => {
  it('unions daily series by day, letting the newer export win on overlap', () => {
    const first = mergeExport(
      emptyHistory(),
      exportOf({
        engagement: [
          { date: '2026-01-01T00:00:00', impressions: 10, engagements: 1 },
          { date: '2026-01-02T00:00:00', impressions: 20, engagements: 2 },
        ],
      }),
      meta('a.xlsx'),
    );
    const second = mergeExport(
      first,
      exportOf({
        engagement: [
          { date: '2026-01-02T00:00:00', impressions: 25, engagements: 3 },
          { date: '2026-01-03T00:00:00', impressions: 30, engagements: 4 },
        ],
      }),
      meta('b.xlsx'),
    );

    expect(second.engagement.map((p) => [p.date.slice(0, 10), p.impressions])).toEqual([
      ['2026-01-01', 10],
      ['2026-01-02', 25],
      ['2026-01-03', 30],
    ]);
    expect(second.imports.map((i) => i.fileName)).toEqual(['a.xlsx', 'b.xlsx']);
  });

  it('keeps one follower-total snapshot per day', () => {
    const h1 = mergeExport(
      emptyHistory(),
      exportOf({ totalFollowers: 1000, totalFollowersAsOf: '2026-01-31T00:00:00' }),
      meta('a'),
    );
    const h2 = mergeExport(
      h1,
      exportOf({ totalFollowers: 1010, totalFollowersAsOf: '2026-01-31T00:00:00' }),
      meta('b'),
    );
    const h3 = mergeExport(
      h2,
      exportOf({ totalFollowers: 1200, totalFollowersAsOf: '2026-03-01T00:00:00' }),
      meta('c'),
    );
    expect(h3.followerTotals).toEqual([
      { day: '2026-01-31', total: 1010 },
      { day: '2026-03-01', total: 1200 },
    ]);
  });

  it('remembers posts that drop out of a later export and joins both rankings by URL', () => {
    const h1 = mergeExport(
      emptyHistory(),
      exportOf({
        topByEngagement: [{ url: 'u1', date: '2026-01-05T00:00:00', value: 40 }],
        topByImpressions: [{ url: 'u1', date: '2026-01-05T00:00:00', value: 900 }],
      }),
      meta('a'),
    );
    const h2 = mergeExport(
      h1,
      exportOf({ topByImpressions: [{ url: 'u2', date: '2026-02-01T00:00:00', value: 500 }] }),
      meta('b'),
    );

    expect(h2.posts).toEqual([
      { url: 'u2', day: '2026-02-01', engagements: null, impressions: 500 },
      { url: 'u1', day: '2026-01-05', engagements: 40, impressions: 900 },
    ]);
    const ranked = rankedPosts(h2.posts);
    expect(ranked.byImpressions.map((p) => p.url)).toEqual(['u1', 'u2']);
    expect(ranked.byEngagement.map((p) => p.url)).toEqual(['u1']);
  });
});
