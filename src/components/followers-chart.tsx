import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { ChartCard } from './chart-card';
import { chartTooltipContent } from './chart-tooltip';
import { formatDateShort, formatNumber } from '../lib/format';
import { weeklyNewFollowers } from '../lib/goal';
import type { FollowerPoint } from '../lib/linkedin-export';

export function FollowersChart({
  data,
  requiredPerWeek,
}: {
  data: FollowerPoint[];
  requiredPerWeek: number | null;
}) {
  const weeks = useMemo(() => weeklyNewFollowers(data), [data]);
  const required = requiredPerWeek !== null ? Math.ceil(requiredPerWeek) : null;

  return (
    <ChartCard
      title="Nuovi follower a settimana"
      description={
        required !== null
          ? `La linea indica i ${formatNumber(required)} a settimana necessari per l'obiettivo entro la data scelta`
          : 'Settimane da lunedì a domenica · imposta una data obiettivo per vedere il ritmo necessario'
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={weeks}
          margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
          barCategoryGap={2}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="week"
            tickFormatter={formatDateShort}
            tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-baseline)' }}
            minTickGap={32}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, (max: number) => Math.max(max, required ?? 0)]}
            tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            content={chartTooltipContent({
              formatter: (v) => `+${formatNumber(v)} follower`,
              labelFormatter: (l) => `Settimana del ${formatDateShort(l)}`,
            })}
          />
          {required !== null && (
            <ReferenceLine
              y={required}
              stroke="var(--chart-ink-muted)"
              label={{
                value: `Necessari ${formatNumber(required)}`,
                position: 'insideTopRight',
                fill: 'var(--chart-ink-secondary)',
                fontSize: 11,
              }}
            />
          )}
          <Bar dataKey="gained" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
