import { Cpu } from 'lucide-react';
import { Button } from '../ui';
import type { TriageStatus } from '../../lib/news';

export function TriageIndicator({
  status,
  onRun,
}: {
  status: TriageStatus | null;
  onRun: () => void;
}) {
  if (!status) return null;
  const color = status.online ? 'var(--status-good)' : 'var(--chart-baseline)';
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      <Cpu className="size-3.5" aria-hidden />
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
        Rizzo Flow {status.online ? 'attivo' : 'spento'}
      </span>
      {status.online ? (
        <>
          <span>
            ·{' '}
            {status.running
              ? `sto valutando (${status.pending} in coda)`
              : status.pending
                ? `${status.pending} da valutare`
                : 'tutto valutato'}
          </span>
          {!status.running && status.pending > 0 && (
            <Button variant="ghost" size="sm" onClick={onRun}>
              Valuta ora
            </Button>
          )}
        </>
      ) : (
        <span>
          · avvialo con <span className="font-mono">npm run dev:full</span>: gli articoli in attesa
          verranno valutati da soli
        </span>
      )}
      {status.lastError && status.online && !status.running && (
        <span className="text-foreground">· ultimo errore: {status.lastError}</span>
      )}
    </div>
  );
}
