import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Radar,
  Star,
  CalendarX,
  ExternalLink,
} from 'lucide-react';
import { InsightCard } from './insight-card';
import { ChartCard } from './chart-card';
import { Table } from './ui';
import {
  computeReachEfficiency,
  computeMomentum,
  computeOverlapPosts,
  computePostingGap,
} from '../lib/extra-insights';
import { formatDateShort, formatNumber } from '../lib/format';
import type { DailyPoint, TopPost } from '../lib/linkedin-export';

export function ExtraInsights({
  engagement,
  totalImpressions,
  totalFollowers,
  topByEngagement,
  topByImpressions,
}: {
  engagement: DailyPoint[];
  totalImpressions: number | null;
  totalFollowers: number | null;
  topByEngagement: TopPost[];
  topByImpressions: TopPost[];
}) {
  const momentum = useMemo(() => computeMomentum(engagement), [engagement]);
  const reachEfficiency = useMemo(
    () => computeReachEfficiency(totalImpressions, totalFollowers),
    [totalImpressions, totalFollowers],
  );
  const overlapPosts = useMemo(
    () => computeOverlapPosts(topByEngagement, topByImpressions),
    [topByEngagement, topByImpressions],
  );
  const postingGap = useMemo(
    () => computePostingGap(topByEngagement, topByImpressions),
    [topByEngagement, topByImpressions],
  );

  const overlapRows = overlapPosts.map((p) => ({
    date: formatDateShort(p.date),
    engagements: formatNumber(p.engagements),
    impressions: formatNumber(p.impressions),
    url: p.url,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {momentum && (
          <InsightCard
            icon={
              momentum.deltaPct > 2 ? TrendingUp : momentum.deltaPct < -2 ? TrendingDown : Minus
            }
            title={
              momentum.deltaPct > 2
                ? 'Impressioni in crescita'
                : momentum.deltaPct < -2
                  ? 'Impressioni in calo'
                  : 'Impressioni stabili'
            }
            description={`Media degli ultimi 7 giorni: ${formatNumber(Math.round(momentum.recentAvg))}/giorno, contro ${formatNumber(Math.round(momentum.previousAvg))}/giorno nei 7 giorni precedenti (${momentum.deltaPct >= 0 ? '+' : ''}${momentum.deltaPct.toFixed(0)}%).`}
          />
        )}

        {reachEfficiency !== null && (
          <InsightCard
            icon={Radar}
            title={`${reachEfficiency.toFixed(1)}x impressioni per follower`}
            description="In media ogni follower vale questo numero di impressioni nel periodo: sopra 1x significa che arrivi oltre la tua rete diretta."
          />
        )}

        {postingGap && (
          <InsightCard
            icon={CalendarX}
            title={`${postingGap.days} giorni di pausa massima`}
            description={`Pausa più lunga tra i post presenti nelle classifiche, dal ${formatDateShort(postingGap.from)} al ${formatDateShort(postingGap.to)}.`}
          />
        )}
      </div>

      {overlapPosts.length > 0 && (
        <ChartCard
          title="Post doppia vittoria"
          description={`${overlapPosts.length} post presenti sia nella Top per engagement sia nella Top per impressioni: i tuoi contenuti più completi`}
        >
          <div className="text-muted-foreground flex items-center gap-1.5 pb-3 text-xs">
            <Star className="size-3.5" />
            <span>Ordinati come nella classifica per engagement</span>
          </div>
          <Table
            columns={[
              { key: 'date', label: 'Pubblicato il' },
              { key: 'engagements', label: 'Interazioni' },
              { key: 'impressions', label: 'Impressioni' },
            ]}
            rows={overlapRows}
            pageSize={10}
            rowActions={(row) => (
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
              >
                Apri <ExternalLink className="size-3" />
              </a>
            )}
          />
        </ChartCard>
      )}
    </div>
  );
}
