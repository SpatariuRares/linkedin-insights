import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Header, type Tab } from './components/header';
import { Dashboard } from './pages/dashboard';
import { CalendarPage } from './pages/calendar';
import { DataPage } from './pages/data';
import { useAppState } from './hooks/use-app-state';
import { parseLinkedInExport } from './lib/linkedin-export';
import { mergeExport } from './lib/history';
import { addDays, dayKey } from './lib/dates';
import { bestBy, computeWeekdayPerformance } from './lib/weekday-insights';
import { defaultState } from './lib/storage';
import { formatNumber } from './lib/format';

const TAB_KEY = 'linkedin-dashboard:tab';

function initialTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === 'dashboard' || v === 'calendar' || v === 'data') return v;
  } catch {
    /* storage unavailable */
  }
  return 'dashboard';
}

export default function App() {
  const { state, update, replace, persisted } = useAppState();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);

  const changeTab = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* storage unavailable */
    }
  };

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        toast.error('Carica un file .xlsx esportato da LinkedIn.');
        return;
      }
      setBusy(true);
      try {
        const parsed = parseLinkedInExport(await file.arrayBuffer());
        update((s) => ({
          ...s,
          history: mergeExport(s.history, parsed, {
            fileName: file.name,
            importedAt: new Date().toISOString(),
          }),
        }));
        toast.success(
          `Export importato: ${formatNumber(parsed.engagement.length)} giorni, ${formatNumber(
            new Set([...parsed.topByEngagement, ...parsed.topByImpressions].map((p) => p.url)).size,
          )} post.`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Impossibile leggere questo file.');
      } finally {
        setBusy(false);
      }
    },
    [update],
  );

  const bestWeekday = useMemo(() => {
    const { engagement } = state.history;
    const last = engagement.at(-1);
    if (!last) return null;
    const from = addDays(dayKey(last.date), -89);
    const perf = computeWeekdayPerformance(engagement.filter((p) => dayKey(p.date) >= from));
    const best = bestBy(perf, 'engagementRate', { sampleKey: 'sampleDays', min: 2 });
    if (!best || best.engagementRate <= 0) return null;
    return { index: perf.indexOf(best), label: best.dayLong };
  }, [state.history]);

  return (
    <div className="min-h-screen">
      <Header tab={tab} onTab={changeTab} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {tab === 'dashboard' && (
          <Dashboard
            state={state}
            onFile={handleFile}
            busy={busy}
            onGoalChange={(goal) => update((s) => ({ ...s, goal }))}
          />
        )}
        {tab === 'calendar' && (
          <CalendarPage
            calendar={state.calendar}
            onChange={(calendar) => update((s) => ({ ...s, calendar }))}
            posts={state.history.posts}
            bestWeekday={bestWeekday}
          />
        )}
        {tab === 'data' && (
          <DataPage
            state={state}
            persisted={persisted}
            onFile={handleFile}
            busy={busy}
            onReplace={replace}
            onReset={() => replace(defaultState())}
          />
        )}
      </main>
    </div>
  );
}
