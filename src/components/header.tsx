import { BarChart3, CalendarDays, Database, Newspaper, Settings, TrendingUp } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { cn } from '../lib/utils';

export type Tab = 'dashboard' | 'news' | 'calendar' | 'settings' | 'data';

const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'settings', label: 'Impostazioni', icon: Settings },
  { id: 'data', label: 'Dati', icon: Database },
];

export function Header({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <header className="border-border bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary/10 flex size-8 items-center justify-center rounded-full">
            <TrendingUp className="text-primary size-4" strokeWidth={2} />
          </span>
          <div className="hidden sm:block">
            <p className="font-display text-foreground text-lg leading-none font-semibold">
              Crescita
            </p>
            <p className="text-muted-foreground text-[11px] leading-none">LinkedIn personale</p>
          </div>
        </div>
        <nav className="flex items-center gap-1" aria-label="Sezioni">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === id
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
