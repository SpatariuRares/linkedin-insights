import { useRef, useState } from 'react';
import { Download, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Table } from '../components/ui';
import { ImportButton } from '../components/import-button';
import { downloadBackup, parseState, type AppState } from '../lib/storage';
import { formatDateLong } from '../lib/format';

export function DataPage({
  state,
  persisted,
  onFile,
  busy,
  onReplace,
  onReset,
}: {
  state: AppState;
  persisted: boolean;
  onFile: (file: File) => void;
  busy: boolean;
  onReplace: (s: AppState) => void;
  onReset: () => void;
}) {
  const restoreRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const { history, calendar } = state;

  const rows = [...history.imports].reverse().map((i) => ({
    file: i.fileName,
    imported: formatDateLong(i.importedAt),
    range:
      i.firstDay && i.lastDay
        ? `${formatDateLong(i.firstDay)} – ${formatDateLong(i.lastDay)}`
        : '—',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold">Dati</h1>
        <p className="text-muted-foreground text-sm">
          Tutto resta nel browser di questo computer. Scarica un backup ogni tanto: se cancelli i
          dati del sito, lo storico si perde.
        </p>
        {!persisted && (
          <p className="text-destructive mt-2 text-sm">
            Il browser non permette di salvare: le modifiche andranno perse alla chiusura. Scarica
            un backup.
          </p>
        )}
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-foreground font-medium">Export importati</h2>
            <p className="text-muted-foreground text-xs">
              {history.engagement.length} giorni di dati · {history.posts.length} post tracciati ·{' '}
              {calendar.entries.length} contenuti nel calendario
            </p>
          </div>
          <ImportButton onFile={onFile} busy={busy} />
        </div>
        {rows.length ? (
          <Table
            columns={[
              { key: 'file', label: 'File' },
              { key: 'imported', label: 'Importato il' },
              { key: 'range', label: 'Periodo coperto' },
            ]}
            rows={rows}
            pageSize={10}
          />
        ) : (
          <p className="text-muted-foreground text-sm">Nessun export ancora.</p>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-foreground font-medium">Come scaricare l&apos;export</h2>
        <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
          <li>Apri il tuo profilo LinkedIn e vai su «Analytics» (o «Statistiche»).</li>
          <li>Apri «Impressioni dei post» / «Contenuti».</li>
          <li>Scegli il periodo più lungo disponibile (365 giorni).</li>
          <li>Clicca «Esporta» e carica qui il file .xlsx.</li>
        </ol>
        <p className="text-muted-foreground text-xs">
          Ripeti ogni 1–2 settimane: i dati si uniscono allo storico e la proiezione verso
          l&apos;obiettivo resta aggiornata.
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-foreground font-medium">Backup</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadBackup(state)}>
            <Download className="size-3.5" /> Scarica backup
          </Button>
          <Button variant="outline" size="sm" onClick={() => restoreRef.current?.click()}>
            <RotateCcw className="size-3.5" /> Ripristina da backup
          </Button>
          <input
            ref={restoreRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                onReplace(parseState(await file.text()));
                toast.success('Backup ripristinato.');
              } catch {
                toast.error('Questo file non è un backup valido.');
              }
            }}
          />
          {confirmReset ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onReset();
                  setConfirmReset(false);
                  toast.success('Dati cancellati.');
                }}
              >
                Conferma: cancella tutto
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                Annulla
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
              <Trash2 className="size-3.5" /> Cancella tutti i dati
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
