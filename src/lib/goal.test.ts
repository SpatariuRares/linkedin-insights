import { describe, expect, it } from 'vitest';
import {
  computeGoal,
  dailyPace,
  followerTotalsSeries,
  projectFollowers,
  weeklyNewFollowers,
} from './goal';
import type { FollowerPoint } from './linkedin-export';

function days(start: string, gains: number[]): FollowerPoint[] {
  const base = new Date(`${start}T00:00:00Z`).getTime();
  return gains.map((g, i) => ({
    date: `${new Date(base + i * 86_400_000).toISOString().slice(0, 10)}T00:00:00`,
    newFollowers: g,
  }));
}

describe('followerTotalsSeries', () => {
  it('rebuilds absolute totals backwards from the anchor', () => {
    const series = followerTotalsSeries(days('2026-01-01', [5, 3, 2]), {
      day: '2026-01-03',
      total: 100,
    });
    expect(series).toEqual([
      { day: '2026-01-01', total: 95 },
      { day: '2026-01-02', total: 98 },
      { day: '2026-01-03', total: 100 },
    ]);
  });

  it('ignores gains after the anchor day', () => {
    const series = followerTotalsSeries(days('2026-01-01', [5, 3, 2]), {
      day: '2026-01-02',
      total: 50,
    });
    expect(series.at(-1)).toEqual({ day: '2026-01-02', total: 50 });
    expect(series[0]).toEqual({ day: '2026-01-01', total: 47 });
  });
});

describe('dailyPace', () => {
  it('averages over the window, or over the history when shorter', () => {
    expect(dailyPace(days('2026-01-01', [2, 4, 6]), 30)).toBeCloseTo(4);
    expect(dailyPace(days('2026-01-01', [100, 1, 1, 1, 1]), 4)).toBeCloseTo(1);
    expect(dailyPace([], 30)).toBeNull();
  });
});

describe('computeGoal', () => {
  const followers = days('2026-09-07', Array(30).fill(10)); // 10/day, ends 2026-10-06
  const anchor = { day: '2026-10-06', total: 4000 };

  it('estimates the ETA at the current 30-day pace', () => {
    const goal = computeGoal({
      followers,
      anchor,
      target: 5000,
      targetDay: null,
      today: '2026-10-06',
    })!;
    expect(goal.remaining).toBe(1000);
    expect(goal.progressPct).toBe(80);
    expect(goal.pace30).toBeCloseTo(10);
    expect(goal.etaDay).toBe('2027-01-14'); // 100 days later
    expect(goal.onTrack).toBeNull();
  });

  it('computes the pace required to hit a target date', () => {
    const goal = computeGoal({
      followers,
      anchor,
      target: 5000,
      targetDay: '2026-11-15',
      today: '2026-10-06',
    })!;
    expect(goal.requiredPerDay).toBeCloseTo(25);
    expect(goal.requiredPerWeek).toBeCloseTo(175);
    expect(goal.onTrack).toBe(false);
  });

  it('has no ETA when followers are not growing', () => {
    const flat = days('2026-09-07', Array(30).fill(0));
    const goal = computeGoal({
      followers: flat,
      anchor,
      target: 5000,
      targetDay: null,
      today: '2026-10-06',
    })!;
    expect(goal.etaDay).toBeNull();
  });

  it('marks the goal reached', () => {
    const goal = computeGoal({
      followers,
      anchor: { day: '2026-10-06', total: 5100 },
      target: 5000,
      targetDay: '2026-12-31',
      today: '2026-10-06',
    })!;
    expect(goal.remaining).toBe(0);
    expect(goal.progressPct).toBe(100);
    expect(goal.onTrack).toBe(true);
  });
});

describe('projectFollowers', () => {
  it('projects weekly and stops at the target', () => {
    const points = projectFollowers({ day: '2026-10-06', total: 4900 }, 10, 5000);
    expect(points).toEqual([
      { day: '2026-10-13', total: 4970 },
      { day: '2026-10-20', total: 5000 },
    ]);
  });
});

describe('weeklyNewFollowers', () => {
  it('buckets gains into Monday-start weeks', () => {
    // 2026-10-04 is a Sunday, 2026-10-05 a Monday
    const weeks = weeklyNewFollowers(days('2026-10-04', [1, 2, 3]));
    expect(weeks).toEqual([
      { week: '2026-09-28', gained: 1, days: 1 },
      { week: '2026-10-05', gained: 5, days: 2 },
    ]);
  });
});
