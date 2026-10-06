import { useMemo } from 'react';
import { ChartCard } from './chart-card';
import { BarList } from './bar-list';
import { computeTopicStats, rankTopics } from '../lib/topics';
import { formatNumber } from '../lib/format';
import type { TopPost } from '../lib/linkedin-export';

export function TopicsChart({
  byEngagement,
  byImpressions,
}: {
  byEngagement: TopPost[];
  byImpressions: TopPost[];
}) {
  const stats = useMemo(
    () => computeTopicStats(byEngagement, byImpressions),
    [byEngagement, byImpressions],
  );
  const topByEngagement = useMemo(() => rankTopics(stats, 'avgEngagement'), [stats]);
  const topByImpressions = useMemo(() => rankTopics(stats, 'avgImpressions'), [stats]);

  if (stats.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard
        title="Temi con più engagement"
        description="Hashtag estratti dai post in evidenza, engagement medio per post"
      >
        <BarList
          items={topByEngagement.map((t) => ({
            key: t.tag,
            label: `#${t.tag}`,
            value: t.avgEngagement,
            displayValue: `${formatNumber(Math.round(t.avgEngagement))}/post`,
          }))}
        />
      </ChartCard>

      <ChartCard
        title="Temi con più impressioni"
        description="Hashtag estratti dai post in evidenza, impressioni medie per post"
      >
        <BarList
          items={topByImpressions.map((t) => ({
            key: t.tag,
            label: `#${t.tag}`,
            value: t.avgImpressions,
            displayValue: `${formatNumber(Math.round(t.avgImpressions))}/post`,
          }))}
        />
      </ChartCard>
    </div>
  );
}
