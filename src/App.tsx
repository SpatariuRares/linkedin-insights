import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Header, type Tab } from './components/header';
import { Dashboard } from './pages/dashboard';
import { CalendarPage } from './pages/calendar';
import { DataPage } from './pages/data';
import { NewsPage } from './pages/news';
import { SettingsPage } from './pages/settings';
import { DraftPage } from './pages/draft';
import { useAppState } from './hooks/use-app-state';
import { parseLinkedInExport } from './lib/linkedin-export';
import { addDays, dayKey } from './lib/dates';
import { bestBy, computeWeekdayPerformance } from './lib/weekday-insights';
import { formatNumber } from './lib/format';
import { Button } from './components/ui';

const TAB_KEY = 'linkedin-dashboard:tab';
const TABS: Tab[] = ['dashboard', 'news', 'calendar', 'settings', 'data'];

function initialTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (TABS.includes(v as Tab)) return v as Tab;
  } catch {
    /* storage unavailable */
  }
  return 'dashboard';
}

export default function App() {
  const app = useAppState();
  const { state, saveError, setGoal, setCalendar, importExport, replace, reset } = app;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [openDraft, setOpenDraft] = useState<number | null>(null);

  const changeTab = (t: Tab) => {
    setOpenDraft(null);
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
        await importExport(file.name, parsed);
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
    [importExport],
  );

  const bestWeekday = useMemo(() => {
    if (!state) return null;
    const { engagement } = state.history;
    const last = engagement.at(-1);
    if (!last) return null;
    const from = addDays(dayKey(last.date), -89);
    const perf = computeWeekdayPerformance(engagement.filter((p) => dayKey(p.date) >= from));
    const best = bestBy(perf, 'engagementRate', { sampleKey: 'sampleDays', min: 2 });
    if (!best || best.engagementRate <= 0) return null;
    return { index: perf.indexOf(best), label: best.dayLong };
  }, [state]);

  if (!state) {
    return (
      <div className="min-h-screen">
        <Header tab={tab} onTab={changeTab} />
        <main className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
          {app.loadError ? (
            <div className="space-y-4">
              <p className="text-foreground font-medium">{app.loadError}</p>
              <Button variant="outline" onClick={() => void app.reload()}>
                Riprova
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Caricamento…</p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header tab={tab} onTab={changeTab} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {openDraft === null && tab === 'dashboard' && (
          <Dashboard state={state} onFile={handleFile} busy={busy} onGoalChange={setGoal} />
        )}
        {openDraft !== null && (
          <DraftPage
            key={openDraft}
            draftId={openDraft}
            onBack={() => setOpenDraft(null)}
            calendar={state.calendar}
            onSaved={() => void app.reload()}
          />
        )}
        {openDraft === null && tab === 'news' && (
          <NewsPage
            pillars={state.calendar.pillars}
            onOpenSettings={() => changeTab('settings')}
            onOpenDraft={(id) => {
              setOpenDraft(id);
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {openDraft === null && tab === 'settings' && <SettingsPage />}
        {openDraft === null && tab === 'calendar' && (
          <CalendarPage
            calendar={state.calendar}
            onChange={setCalendar}
            posts={state.history.posts}
            bestWeekday={bestWeekday}
            onOpenDraft={(id) => {
              setOpenDraft(id);
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {openDraft === null && tab === 'data' && (
          <DataPage
            state={state}
            saveError={saveError}
            onFile={handleFile}
            busy={busy}
            onReplace={replace}
            onReset={reset}
          />
        )}
      </main>
    </div>
  );
}
