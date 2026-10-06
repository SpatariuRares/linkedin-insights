import { addDays, dayKey, daysBetween, weekStart } from './dates';
import type { FollowerPoint } from './linkedin-export';
import type { FollowerTotal } from './history';

export type FollowerTotalPoint = { day: string; total: number };

/**
 * The export only gives one absolute number ("total followers on <date>") plus daily new-follower
 * deltas, so the absolute curve is rebuilt backwards from that anchor: total(d) = anchor - every
 * gain after d. Using the most recent anchor keeps the curve right where it matters, at today.
 */
export function followerTotalsSeries(
  followers: FollowerPoint[],
  anchor: FollowerTotal | null,
): FollowerTotalPoint[] {
  if (!anchor) return [];
  const sorted = [...followers]
    .map((p) => ({ day: dayKey(p.date), gained: p.newFollowers }))
    .filter((p) => p.day <= anchor.day)
    .sort((a, b) => a.day.localeCompare(b.day));

  let running = anchor.total - sorted.reduce((s, p) => s + p.gained, 0);
  const series = sorted.map((p) => {
    running += p.gained;
    return { day: p.day, total: running };
  });
  if (series.at(-1)?.day !== anchor.day) series.push({ day: anchor.day, total: anchor.total });
  return series;
}

/** Average daily gain over the last `windowDays` of data (fewer if the history is shorter). */
export function dailyPace(followers: FollowerPoint[], windowDays: number): number | null {
  if (followers.length === 0) return null;
  const days = followers.map((p) => dayKey(p.date)).sort();
  const last = days.at(-1)!;
  const from = addDays(last, -(windowDays - 1));
  const inWindow = followers.filter((p) => dayKey(p.date) >= from);
  const span = Math.min(windowDays, daysBetween(days[0], last) + 1);
  const gained = inWindow.reduce((s, p) => s + p.newFollowers, 0);
  return span > 0 ? gained / span : null;
}

export type GoalStatus = {
  current: number;
  asOf: string;
  target: number;
  remaining: number;
  progressPct: number;
  pace30: number | null;
  pace90: number | null;
  etaDay: string | null;
  targetDay: string | null;
  requiredPerDay: number | null;
  requiredPerWeek: number | null;
  onTrack: boolean | null;
};

export function computeGoal(opts: {
  followers: FollowerPoint[];
  anchor: FollowerTotal | null;
  target: number;
  targetDay: string | null;
  today: string;
}): GoalStatus | null {
  const { followers, anchor, target, targetDay, today } = opts;
  if (!anchor) return null;

  const current = anchor.total;
  const remaining = Math.max(0, target - current);
  const pace30 = dailyPace(followers, 30);
  const pace90 = dailyPace(followers, 90);

  let etaDay: string | null = null;
  if (remaining === 0) etaDay = anchor.day;
  else if (pace30 && pace30 > 0) etaDay = addDays(anchor.day, Math.ceil(remaining / pace30));

  let requiredPerDay: number | null = null;
  let onTrack: boolean | null = null;
  if (targetDay && remaining > 0) {
    const daysLeft = daysBetween(anchor.day > today ? anchor.day : today, targetDay);
    requiredPerDay = daysLeft > 0 ? remaining / daysLeft : null;
    onTrack = requiredPerDay !== null && pace30 !== null ? pace30 >= requiredPerDay : false;
  } else if (targetDay) {
    onTrack = true;
  }

  return {
    current,
    asOf: anchor.day,
    target,
    remaining,
    progressPct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
    pace30,
    pace90,
    etaDay,
    targetDay,
    requiredPerDay,
    requiredPerWeek: requiredPerDay !== null ? requiredPerDay * 7 : null,
    onTrack,
  };
}

/** Straight-line projection at `pacePerDay`, one point per week, until `target` or `maxDays`. */
export function projectFollowers(
  from: FollowerTotalPoint,
  pacePerDay: number,
  target: number,
  maxDays = 365,
): FollowerTotalPoint[] {
  if (pacePerDay <= 0) return [];
  const points: FollowerTotalPoint[] = [];
  for (let d = 7; d <= maxDays; d += 7) {
    const total = from.total + pacePerDay * d;
    points.push({ day: addDays(from.day, d), total: Math.min(total, target) });
    if (total >= target) break;
  }
  return points;
}

export type WeeklyGain = { week: string; gained: number; days: number };

export function weeklyNewFollowers(followers: FollowerPoint[]): WeeklyGain[] {
  const byWeek = new Map<string, WeeklyGain>();
  for (const p of followers) {
    const week = weekStart(dayKey(p.date));
    const entry = byWeek.get(week) ?? { week, gained: 0, days: 0 };
    entry.gained += p.newFollowers;
    entry.days += 1;
    byWeek.set(week, entry);
  }
  return [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
}
