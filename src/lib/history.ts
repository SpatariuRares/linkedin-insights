import { dayKey } from './dates';
import type {
  DailyPoint,
  DemographicRow,
  FollowerPoint,
  LinkedInExport,
  TopPost,
} from './linkedin-export';

/**
 * A single LinkedIn export covers at most 365 days and only its top 50 posts. To see growth over a
 * longer horizon, every imported export is folded into one History: daily series are keyed by day
 * (a newer export overwrites overlapping days, since LinkedIn revises recent numbers), and posts
 * are keyed by URL so a post keeps its stats even after it falls out of a later export's top 50.
 */
export type ImportRecord = {
  fileName: string;
  importedAt: string;
  rangeLabel: string | null;
  firstDay: string | null;
  lastDay: string | null;
  impressions: number | null;
  membersReached: number | null;
};

export type TrackedPost = {
  url: string;
  day: string;
  engagements: number | null;
  impressions: number | null;
};

export type FollowerTotal = { day: string; total: number };

export type History = {
  engagement: DailyPoint[];
  followers: FollowerPoint[];
  followerTotals: FollowerTotal[];
  posts: TrackedPost[];
  demographics: DemographicRow[];
  imports: ImportRecord[];
};

export function emptyHistory(): History {
  return {
    engagement: [],
    followers: [],
    followerTotals: [],
    posts: [],
    demographics: [],
    imports: [],
  };
}

export function hasData(history: History): boolean {
  return history.imports.length > 0;
}

function mergeByDay<T extends { date: string }>(older: T[], newer: T[]): T[] {
  const byDay = new Map<string, T>();
  for (const p of older) byDay.set(dayKey(p.date), p);
  for (const p of newer) byDay.set(dayKey(p.date), { ...p, date: `${dayKey(p.date)}T00:00:00` });
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function mergePosts(
  older: TrackedPost[],
  byEngagement: TopPost[],
  byImpressions: TopPost[],
): TrackedPost[] {
  const byUrl = new Map(older.map((p) => [p.url, { ...p }]));
  const upsert = (post: TopPost, field: 'engagements' | 'impressions') => {
    const existing = byUrl.get(post.url);
    const day = post.date ? dayKey(post.date) : (existing?.day ?? '');
    byUrl.set(post.url, {
      url: post.url,
      day,
      engagements: existing?.engagements ?? null,
      impressions: existing?.impressions ?? null,
      [field]: post.value,
    });
  };
  for (const p of byEngagement) upsert(p, 'engagements');
  for (const p of byImpressions) upsert(p, 'impressions');
  return [...byUrl.values()].sort((a, b) => b.day.localeCompare(a.day));
}

export function mergeExport(
  history: History,
  data: LinkedInExport,
  meta: { fileName: string; importedAt: string },
): History {
  const engagement = mergeByDay(history.engagement, data.engagement);
  const followers = mergeByDay(history.followers, data.followers);

  const days = [...data.engagement, ...data.followers].map((p) => dayKey(p.date)).sort();
  const lastDay = days.at(-1) ?? null;

  let followerTotals = history.followerTotals;
  if (data.totalFollowers !== null) {
    const day = data.totalFollowersAsOf
      ? dayKey(data.totalFollowersAsOf)
      : (lastDay ?? dayKey(meta.importedAt));
    followerTotals = [
      ...history.followerTotals.filter((t) => t.day !== day),
      { day, total: data.totalFollowers },
    ].sort((a, b) => a.day.localeCompare(b.day));
  }

  return {
    engagement,
    followers,
    followerTotals,
    posts: mergePosts(history.posts, data.topByEngagement, data.topByImpressions),
    demographics: data.demographics.length > 0 ? data.demographics : history.demographics,
    imports: [
      ...history.imports,
      {
        fileName: meta.fileName,
        importedAt: meta.importedAt,
        rangeLabel: data.rangeLabel,
        firstDay: days[0] ?? null,
        lastDay,
        impressions: data.impressions,
        membersReached: data.membersReached,
      },
    ],
  };
}

/** Rebuilds the two ranked lists the insight components expect, from the merged post table. */
export function rankedPosts(posts: TrackedPost[]) {
  const toTop = (p: TrackedPost, value: number): TopPost => ({
    url: p.url,
    date: `${p.day}T00:00:00`,
    value,
  });
  const byEngagement = posts
    .filter((p) => p.engagements !== null)
    .map((p) => toTop(p, p.engagements!))
    .sort((a, b) => b.value - a.value);
  const byImpressions = posts
    .filter((p) => p.impressions !== null)
    .map((p) => toTop(p, p.impressions!))
    .sort((a, b) => b.value - a.value);
  return { byEngagement, byImpressions };
}
