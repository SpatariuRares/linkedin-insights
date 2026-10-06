import { useMemo, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb, Plus, Star } from 'lucide-react';
import { Button, Card, Input, Label } from '../components/ui';
import { EntryDialog } from '../components/calendar/entry-dialog';
import { PillarsEditor } from '../components/calendar/pillars-editor';
import { PillarDot, StatusIcon } from '../components/calendar/status-icon';
import {
  countsTowardCadence,
  entriesByDay,
  findPostStats,
  monthGrid,
  newId,
  POST_FORMATS,
  type CalendarEntry,
  type CalendarState,
} from '../lib/calendar';
import { dayKey, keyToLocalDate } from '../lib/dates';
import type { TrackedPost } from '../lib/history';
import { WEEKDAY_LABELS } from '../lib/weekday-insights';
import { cn } from '../lib/utils';

const DRAG_TYPE = 'application/x-calendar-entry';
const monthFmt = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
const agendaFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric' });

function blankEntry(day: string | null): CalendarEntry {
  return {
    id: newId(),
    day,
    title: '',
    notes: '',
    format: 'testo',
    pillarId: null,
    status: day ? 'programmato' : 'idea',
    postUrl: null,
  };
}

export function CalendarPage({
  calendar,
  onChange,
  posts,
  bestWeekday,
}: {
  calendar: CalendarState;
  onChange: (c: CalendarState) => void;
  posts: TrackedPost[];
  /** 0 = Monday, from the analytics; null when there's no data yet. */
  bestWeekday: { index: number; label: string } | null;
}) {
  const today = dayKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [editing, setEditing] = useState<CalendarEntry | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const byDay = useMemo(() => entriesByDay(calendar.entries), [calendar.entries]);
  const backlog = calendar.entries.filter((e) => !e.day);
  const pillarById = useMemo(
    () => new Map(calendar.pillars.map((p) => [p.id, p])),
    [calendar.pillars],
  );
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const monthEntries = calendar.entries.filter((e) => e.day?.startsWith(monthPrefix));

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of monthEntries) if (e.pillarId) m.set(e.pillarId, (m.get(e.pillarId) ?? 0) + 1);
    return m;
  }, [monthEntries]);

  const upsert = (entry: CalendarEntry) => {
    const exists = calendar.entries.some((e) => e.id === entry.id);
    onChange({
      ...calendar,
      entries: exists
        ? calendar.entries.map((e) => (e.id === entry.id ? entry : e))
        : [...calendar.entries, entry],
    });
  };

  const moveTo = (id: string, day: string | null) => {
    onChange({
      ...calendar,
      entries: calendar.entries.map((e) => {
        if (e.id !== id) return e;
        // Scheduling an idea promotes it to a draft; unscheduling a planned post demotes it.
        const status =
          day && e.status === 'idea'
            ? 'bozza'
            : !day && e.status === 'programmato'
              ? 'bozza'
              : e.status;
        return { ...e, day, status };
      }),
    });
  };

  const dropProps = (day: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDropTarget(day ?? 'backlog');
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id) moveTo(id, day);
    },
  });

  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const published = monthEntries.filter((e) => e.status === 'pubblicato').length;
  const scheduled = monthEntries.filter((e) => e.status === 'programmato').length;

  const chip = (e: CalendarEntry, compact = true) => {
    const pillar = e.pillarId ? pillarById.get(e.pillarId) : undefined;
    const stats = e.status === 'pubblicato' ? findPostStats(e, posts) : null;
    const format = POST_FORMATS.find((f) => f.id === e.format)!.label;
    return (
      <button
        key={e.id}
        type="button"
        draggable
        onDragStart={(ev) => {
          ev.dataTransfer.setData(DRAG_TYPE, e.id);
          ev.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => setEditing(e)}
        title={`${e.title} · ${format}${pillar ? ` · ${pillar.name}` : ''}${stats?.impressions != null ? ` · ${stats.impressions} impressioni` : ''}`}
        className={cn(
          'bg-background border-border hover:border-ring flex w-full cursor-grab items-start gap-1.5 rounded-md border text-left text-xs active:cursor-grabbing',
          compact ? 'px-1.5 py-1' : 'px-2.5 py-2',
          e.status === 'pubblicato' && 'opacity-70',
        )}
      >
        <span className="flex h-4 items-center">
          <PillarDot slot={pillar?.slot ?? null} />
        </span>
        <span
          className={cn(
            'text-foreground min-w-0 flex-1 leading-snug',
            compact ? 'line-clamp-2' : 'truncate',
          )}
        >
          {e.title}
        </span>
        <StatusIcon status={e.status} />
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-foreground text-2xl font-semibold capitalize">
            {monthFmt.format(new Date(cursor.year, cursor.month, 1))}
          </h1>
          <p className="text-muted-foreground text-sm">
            {published} pubblicati · {scheduled} programmati · {backlog.length} idee in archivio
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => shiftMonth(-1)}
            aria-label="Mese precedente"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date();
              setCursor({ year: d.getFullYear(), month: d.getMonth() });
            }}
          >
            Oggi
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => shiftMonth(1)}
            aria-label="Mese successivo"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button size="sm" className="ml-2" onClick={() => setEditing(blankEntry(today))}>
            <Plus className="size-3.5" /> Nuovo
          </Button>
        </div>
      </div>

      {bestWeekday && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Star className="size-3.5" />
          Dai tuoi dati, il {bestWeekday.label.toLowerCase()} è il giorno con l&apos;engagement più
          alto: è evidenziato nel calendario.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
        {/* Month grid (desktop) */}
        <Card className="hidden self-start overflow-hidden md:block">
          <div className="border-border grid grid-cols-[repeat(7,minmax(0,1fr))_52px] border-b text-xs">
            {WEEKDAY_LABELS.map((d, i) => (
              <div
                key={d}
                className={cn(
                  'text-muted-foreground px-2 py-2 font-medium',
                  bestWeekday?.index === i && 'text-foreground',
                )}
              >
                {d}
                {bestWeekday?.index === i && (
                  <Star className="ml-1 inline size-3" aria-label="giorno migliore" />
                )}
              </div>
            ))}
            <div
              className="text-muted-foreground px-2 py-2 text-right font-medium"
              title="Post programmati o pubblicati / obiettivo settimanale"
            >
              Sett.
            </div>
          </div>
          {weeks.map((week) => {
            const planned = week
              .flatMap((d) => byDay.get(d) ?? [])
              .filter(countsTowardCadence).length;
            const met = planned >= calendar.postsPerWeek;
            return (
              <div
                key={week[0]}
                className="border-border grid grid-cols-[repeat(7,minmax(0,1fr))_52px] border-b last:border-b-0"
              >
                {week.map((day, i) => {
                  const inMonth = day.startsWith(monthPrefix);
                  const entries = byDay.get(day) ?? [];
                  return (
                    <div
                      key={day}
                      {...dropProps(day)}
                      className={cn(
                        'group border-border relative min-h-28 space-y-1 border-r p-1.5',
                        !inMonth && 'bg-muted/40',
                        bestWeekday?.index === i && inMonth && 'bg-secondary/50',
                        dropTarget === day && 'ring-ring ring-2 ring-inset',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            'flex size-6 items-center justify-center rounded-full text-xs',
                            day === today
                              ? 'bg-primary text-primary-foreground font-semibold'
                              : inMonth
                                ? 'text-foreground'
                                : 'text-muted-foreground',
                          )}
                        >
                          {Number(day.slice(8))}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditing(blankEntry(day))}
                          className="text-muted-foreground hover:text-foreground rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Aggiungi contenuto il ${day}`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      {entries.map((e) => chip(e))}
                    </div>
                  );
                })}
                <div className="flex items-start justify-end p-2 text-xs tabular-nums">
                  <span
                    className={cn('font-medium', met ? 'text-foreground' : 'text-muted-foreground')}
                    title={
                      met ? 'Obiettivo settimanale raggiunto' : 'Sotto l’obiettivo settimanale'
                    }
                  >
                    {planned}/{calendar.postsPerWeek}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>

        {/* Agenda (mobile) */}
        <div className="space-y-2 md:hidden">
          {weeks
            .flat()
            .filter((d) => d.startsWith(monthPrefix))
            .map((day) => {
              const entries = byDay.get(day) ?? [];
              return (
                <div key={day} className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(blankEntry(day))}
                    className={cn(
                      'w-14 shrink-0 rounded-md py-1 text-left text-xs capitalize',
                      day === today ? 'text-primary font-semibold' : 'text-muted-foreground',
                    )}
                    aria-label={`Aggiungi contenuto il ${day}`}
                  >
                    {agendaFmt.format(keyToLocalDate(day))}
                  </button>
                  <div className="min-w-0 flex-1 space-y-1">
                    {entries.length ? (
                      entries.map((e) => chip(e, false))
                    ) : (
                      <div className="border-border h-px translate-y-3 border-t" />
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        <aside className="space-y-6">
          <Card className="p-4" {...dropProps(null)}>
            <div
              className={cn(
                'rounded-md',
                dropTarget === 'backlog' &&
                  'ring-ring ring-2 ring-offset-4 ring-offset-[var(--card)]',
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                  <Lightbulb className="size-4" /> Archivio idee
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(blankEntry(null))}
                  aria-label="Nuova idea"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              {backlog.length ? (
                <div className="space-y-1.5">{backlog.map((e) => chip(e, false))}</div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Annota qui le idee senza data, poi trascinale su un giorno del calendario.
                </p>
              )}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <Label htmlFor="posts-per-week">Post a settimana (obiettivo)</Label>
            <Input
              id="posts-per-week"
              type="number"
              min={1}
              max={14}
              value={calendar.postsPerWeek}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1 && n <= 14) onChange({ ...calendar, postsPerWeek: n });
              }}
            />
            <p className="text-muted-foreground text-xs">
              Contano i contenuti programmati o pubblicati. La colonna «Sett.» mostra se la
              settimana è coperta.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-foreground mb-1 text-sm font-medium">Pilastri di contenuto</h2>
            <p className="text-muted-foreground mb-3 text-xs">
              I temi su cui vuoi farti riconoscere. Il numero indica quanti contenuti hai questo
              mese.
            </p>
            <PillarsEditor
              pillars={calendar.pillars}
              usage={usage}
              onChange={(pillars) => {
                const ids = new Set(pillars.map((p) => p.id));
                onChange({
                  ...calendar,
                  pillars,
                  entries: calendar.entries.map((e) =>
                    e.pillarId && !ids.has(e.pillarId) ? { ...e, pillarId: null } : e,
                  ),
                });
              }}
            />
          </Card>
        </aside>
      </div>

      {editing && (
        <EntryDialog
          key={editing.id}
          entry={editing}
          pillars={calendar.pillars}
          posts={posts}
          onClose={() => setEditing(null)}
          onSave={(e) => {
            upsert(e);
            setEditing(null);
          }}
          onDelete={(id) => {
            onChange({ ...calendar, entries: calendar.entries.filter((e) => e.id !== id) });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
