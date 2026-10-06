import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { CheckCircle2, AlertTriangle, Target } from 'lucide-react';
import { Card, Input, Label } from './ui';
import { chartTooltipContent } from './chart-tooltip';
import { formatDateLong, formatDateShort, formatMonth, formatNumber } from '../lib/format';
import { keyToLocalDate } from '../lib/dates';
import { followerTotalsSeries, projectFollowers, type GoalStatus } from '../lib/goal';
import type { FollowerPoint } from '../lib/linkedin-export';
import type { FollowerTotal } from '../lib/history';
import type { GoalSettings } from '../lib/storage';

/** 4–6 round ticks covering [min, max], starting at a round number at or below min. */
function niceTicks(min: number, max: number): number[] {
  const span = Math.max(1, max - Math.max(0, min));
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const start = Math.max(0, Math.floor(min / step) * step);
  const ticks: number[] = [];
  for (let v = start; v < max + step; v += step) ticks.push(v);
  return ticks;
}

function pace(n: number | null) {
  if (n === null) return '—';
  return `${n.toFixed(n < 10 ? 1 : 0).replace('.', ',')}/giorno`;
}

export function GoalSection({
  goal,
  settings,
  onChange,
  followers,
  anchor,
}: {
  goal: GoalStatus;
  settings: GoalSettings;
  onChange: (s: GoalSettings) => void;
  followers: FollowerPoint[];
  anchor: FollowerTotal;
}) {
  const { chartData, ticks, domain } = useMemo(() => {
    const t = (day: string) => keyToLocalDate(day).getTime();
    const actual = followerTotalsSeries(followers, anchor);
    const projection =
      goal.pace30 && goal.remaining > 0
        ? projectFollowers({ day: anchor.day, total: anchor.total }, goal.pace30, goal.target)
        : [];
    const data = [
      ...actual.map((p) => ({
        t: t(p.day),
        actual: p.total,
        projected: p.day === anchor.day && projection.length ? p.total : undefined,
      })),
      ...projection.map((p) => ({ t: t(p.day), actual: undefined, projected: p.total })),
    ];
    const values = data.flatMap((d) => [d.actual, d.projected]).filter((v) => v !== undefined);
    const yTicks = niceTicks(Math.min(...values), Math.max(...values, goal.target));
    return { chartData: data, ticks: yTicks, domain: [yTicks[0], yTicks.at(-1)!] };
  }, [followers, anchor, goal.pace30, goal.remaining, goal.target]);

  const reached = goal.remaining === 0;
  const projectionCapped =
    !reached && goal.etaDay !== null && chartData.at(-1)!.t < keyToLocalDate(goal.etaDay).getTime();

  return (
    <Card className="p-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-6">
          <div>
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
              <Target className="size-4" /> Obiettivo follower
            </p>
            <p className="text-foreground mt-2 text-5xl font-semibold tracking-tight">
              {formatNumber(goal.current)}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              su {formatNumber(goal.target)} · aggiornato al {formatDateShort(goal.asOf)}
            </p>
          </div>

          <div className="space-y-1.5">
            <div
              className="h-2.5 w-full overflow-hidden rounded-full"
              style={{ background: 'color-mix(in srgb, var(--series-1) 18%, transparent)' }}
              role="progressbar"
              aria-valuenow={Math.round(goal.progressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Avanzamento verso l'obiettivo"
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${goal.progressPct}%`, background: 'var(--series-1)' }}
              />
            </div>
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>{goal.progressPct.toFixed(1).replace('.', ',')}%</span>
              <span>
                {reached ? 'Obiettivo raggiunto' : `mancano ${formatNumber(goal.remaining)}`}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Ritmo attuale (30 gg)</dt>
              <dd className="text-foreground mt-0.5 font-medium">{pace(goal.pace30)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Ritmo 90 gg</dt>
              <dd className="text-foreground mt-0.5 font-medium">{pace(goal.pace90)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground text-xs">Arrivo stimato a questo ritmo</dt>
              <dd className="text-foreground mt-0.5 font-medium">
                {reached
                  ? 'Già raggiunto'
                  : goal.etaDay
                    ? formatDateLong(goal.etaDay)
                    : 'Nessuna crescita negli ultimi 30 giorni'}
              </dd>
            </div>
          </dl>

          <div className="border-border grid grid-cols-2 gap-3 border-t pt-5">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Obiettivo</Label>
              <Input
                id="goal-target"
                type="number"
                min={1}
                step={100}
                value={settings.target}
                onChange={(e) => {
                  const target = Number(e.target.value);
                  if (target > 0) onChange({ ...settings, target });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">Entro il</Label>
              <Input
                id="goal-date"
                type="date"
                value={settings.targetDay ?? ''}
                onChange={(e) => onChange({ ...settings, targetDay: e.target.value || null })}
              />
            </div>
            {goal.targetDay && !reached && (
              <p className="bg-secondary col-span-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
                {goal.onTrack ? (
                  <CheckCircle2
                    className="mt-px size-4 shrink-0"
                    style={{ color: 'var(--status-good)' }}
                  />
                ) : (
                  <AlertTriangle
                    className="mt-px size-4 shrink-0"
                    style={{ color: 'var(--status-serious)' }}
                  />
                )}
                <span className="text-foreground">
                  {goal.requiredPerDay === null
                    ? 'La data obiettivo è già passata.'
                    : `${goal.onTrack ? 'In linea' : 'Non in linea'}: servono ${pace(goal.requiredPerDay)} (${formatNumber(Math.ceil(goal.requiredPerWeek!))} a settimana), oggi sei a ${pace(goal.pace30)}.`}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="font-display text-foreground text-base font-medium">
                Follower totali e proiezione
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Storico ricostruito dagli export · proiezione lineare al ritmo degli ultimi 30
                giorni
                {projectionCapped ? ' (mostrata per 12 mesi)' : ''}
              </p>
            </div>
            <div className="text-muted-foreground flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ background: 'var(--series-1)' }} />
                Reale
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="16" height="2" aria-hidden>
                  <line
                    x1="0"
                    y1="1"
                    x2="16"
                    y2="1"
                    stroke="var(--series-2)"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                </svg>
                Proiezione
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillGoal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v: number) => formatMonth(new Date(v))}
                tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--chart-baseline)' }}
                minTickGap={40}
              />
              <YAxis
                domain={domain}
                ticks={ticks}
                tickFormatter={(v: number) => formatNumber(Math.round(v))}
                tick={{ fill: 'var(--chart-ink-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip
                content={chartTooltipContent({
                  formatter: (v) => `${formatNumber(Math.round(v))} follower`,
                  labelFormatter: (v) => formatDateShort(new Date(Number(v))),
                })}
              />
              <ReferenceLine
                y={goal.target}
                stroke="var(--chart-ink-muted)"
                strokeWidth={1}
                label={{
                  value: `Obiettivo ${formatNumber(goal.target)}`,
                  position: 'insideTopLeft',
                  fill: 'var(--chart-ink-secondary)',
                  fontSize: 11,
                }}
              />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="var(--series-1)"
                strokeWidth={2}
                fill="url(#fillGoal)"
                connectNulls={false}
                activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
              />
              <Line
                type="linear"
                dataKey="projected"
                stroke="var(--series-2)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
                activeDot={{ r: 4, stroke: 'var(--chart-surface)', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
