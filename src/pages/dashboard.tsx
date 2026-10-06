import { useMemo, useState } from 'react';
import { Eye, Users, UserPlus, TrendingUp } from 'lucide-react';
import { FileDrop } from '../components/file-drop';
import { ImportButton } from '../components/import-button';
import { PeriodFilter } from '../components/period-filter';
import { PERIODS, type PeriodId } from '../lib/periods';
import { GoalSection } from '../components/goal-section';
import { StatTile } from '../components/stat-tile';
import { EngagementChart } from '../components/engagement-chart';
import { FollowersChart } from '../components/followers-chart';
import { WeekdayChart } from '../components/weekday-chart';
import { ExtraInsights } from '../components/extra-insights';
import { TopPosts } from '../components/top-posts';
import { TopicsChart } from '../components/topics-chart';
import { Demographics } from '../components/demographics';
import { hasData, rankedPosts } from '../lib/history';
import { computeGoal } from '../lib/goal';
import { addDays, dayKey } from '../lib/dates';
import { formatCompact, formatDateShort, formatNumber, formatPercent } from '../lib/format';
import type { AppState, GoalSettings } from '../lib/storage';

const PERIOD_KEY = 'linkedin-dashboard:period';

function initialPeriod(): PeriodId {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    if (PERIODS.some((p) => p.id === v)) return v as PeriodId;
  } catch {
    /* storage unavailable */
  }
  return '90';
}

export function Dashboard({
  state,
  onFile,
  busy,
  onGoalChange,
}: {
  state: AppState;
  onFile: (file: File) => void;
  busy: boolean;
  onGoalChange: (goal: GoalSettings) => void;
}) {
  const { history } = state;
  const [period, setPeriod] = useState<PeriodId>(initialPeriod);

  const changePeriod = (id: PeriodId) => {
    setPeriod(id);
    try {
      localStorage.setItem(PERIOD_KEY, id);
    } catch {
      /* storage unavailable */
    }
  };

  const lastDay = useMemo(() => {
    const days = [...history.engagement, ...history.followers].map((p) => dayKey(p.date)).sort();
    return days.at(-1) ?? null;
  }, [history]);

  const view = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)!.days;
    const from = days && lastDay ? addDays(lastDay, -(days - 1)) : null;
    const inRange = (d: string) => !from || dayKey(d) >= from;
    const engagement = history.engagement.filter((p) => inRange(p.date));
    const followers = history.followers.filter((p) => inRange(p.date));
    const posts = history.posts.filter((p) => p.day && inRange(p.day));
    const ranked = rankedPosts(posts);

    const totalImpressions = engagement.reduce((s, d) => s + d.impressions, 0);
    const totalEngagements = engagement.reduce((s, d) => s + d.engagements, 0);
    const newFollowers = followers.reduce((s, d) => s + d.newFollowers, 0);
    return {
      from: engagement[0]?.date ?? from,
      engagement,
      followers,
      ...ranked,
      totalImpressions,
      totalEngagements,
      newFollowers,
      engagementRate: totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0,
    };
  }, [history, period, lastDay]);

  const anchor = history.followerTotals.at(-1) ?? null;
  const goal = useMemo(
    () =>
      computeGoal({
        followers: history.followers,
        anchor,
        target: state.goal.target,
        targetDay: state.goal.targetDay,
        today: dayKey(new Date()),
      }),
    [history.followers, anchor, state.goal],
  );

  if (!hasData(history)) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-foreground text-2xl font-semibold">
            Inizia dal tuo export
          </h1>
          <p className="text-muted-foreground text-sm">
            Ogni export che carichi si aggiunge allo storico, così vedi la crescita oltre i 365
            giorni che LinkedIn ti dà. Ripeti l&apos;import ogni settimana o due.
          </p>
        </div>
        <FileDrop onFile={onFile} busy={busy} />
      </div>
    );
  }

  const latestImport = history.imports.at(-1)!;

  return (
    <div className="space-y-8">
      {goal && anchor && (
        <GoalSection
          goal={goal}
          settings={state.goal}
          onChange={onGoalChange}
          followers={history.followers}
          anchor={anchor}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-foreground text-2xl font-semibold">Andamento</h1>
          {view.from && lastDay && (
            <p className="text-muted-foreground text-sm">
              Dal {formatDateShort(view.from)} al {formatDateShort(lastDay)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={changePeriod} />
          <ImportButton onFile={onFile} busy={busy} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Impressioni"
          value={formatCompact(view.totalImpressions)}
          sub={`${formatNumber(view.totalImpressions)} nel periodo`}
          icon={Eye}
          accent="series-1"
        />
        <StatTile
          label="Membri raggiunti"
          value={formatCompact(latestImport.membersReached)}
          sub={latestImport.rangeLabel ?? 'ultimo export'}
          icon={Users}
          accent="series-2"
        />
        <StatTile
          label="Nuovi follower"
          value={`+${formatNumber(view.newFollowers)}`}
          sub="nel periodo"
          icon={UserPlus}
          accent="series-3"
        />
        <StatTile
          label="Tasso di engagement"
          value={formatPercent(view.engagementRate, 2)}
          sub={`${formatNumber(view.totalEngagements)} interazioni`}
          icon={TrendingUp}
          accent="series-4"
        />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-foreground text-lg font-medium">Segnali</h2>
        <ExtraInsights
          engagement={view.engagement}
          totalImpressions={view.totalImpressions}
          totalFollowers={anchor?.total ?? null}
          topByEngagement={view.byEngagement}
          topByImpressions={view.byImpressions}
        />
      </section>

      <section className="space-y-4">
        <FollowersChart data={view.followers} requiredPerWeek={goal?.requiredPerWeek ?? null} />
      </section>

      <section className="space-y-4">
        <EngagementChart data={view.engagement} />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-foreground text-lg font-medium">Quando pubblicare</h2>
        <WeekdayChart
          engagement={view.engagement}
          topByEngagement={view.byEngagement}
          topByImpressions={view.byImpressions}
        />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-foreground text-lg font-medium">Post in evidenza</h2>
        <TopPosts byEngagement={view.byEngagement} byImpressions={view.byImpressions} />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-foreground text-lg font-medium">Temi che funzionano</h2>
        <TopicsChart byEngagement={view.byEngagement} byImpressions={view.byImpressions} />
      </section>

      {history.demographics.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-foreground text-lg font-medium">Chi ti segue</h2>
          <Demographics rows={history.demographics} />
        </section>
      )}
    </div>
  );
}
