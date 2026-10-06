import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Button, Input, Label } from '../ui';
import {
  POST_FORMATS,
  POST_STATUSES,
  findPostStats,
  type CalendarEntry,
  type Pillar,
} from '../../lib/calendar';
import type { TrackedPost } from '../../lib/history';
import { formatNumber } from '../../lib/format';

const selectClass =
  'border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none';

export function EntryDialog({
  entry,
  pillars,
  posts,
  onSave,
  onDelete,
  onClose,
}: {
  entry: CalendarEntry;
  pillars: Pillar[];
  posts: TrackedPost[];
  onSave: (e: CalendarEntry) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(entry);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const isNew = entry.title === '';
  const stats = findPostStats(draft, posts);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof CalendarEntry>(key: K, value: CalendarEntry[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    onSave({ ...draft, title: draft.title.trim(), postUrl: draft.postUrl?.trim() || null });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-dialog-title"
        className="bg-card border-border max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="entry-dialog-title" className="font-display text-foreground text-lg font-medium">
            {isNew ? 'Nuovo contenuto' : 'Modifica contenuto'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Chiudi">
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="entry-title">Hook / titolo</Label>
            <Input
              id="entry-title"
              ref={titleRef}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Es. 3 errori che ho fatto al primo lavoro da dev"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entry-day">Data</Label>
              <Input
                id="entry-day"
                type="date"
                value={draft.day ?? ''}
                onChange={(e) => set('day', e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-status">Stato</Label>
              <select
                id="entry-status"
                className={selectClass}
                value={draft.status}
                onChange={(e) => set('status', e.target.value as CalendarEntry['status'])}
              >
                {POST_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-format">Formato</Label>
              <select
                id="entry-format"
                className={selectClass}
                value={draft.format}
                onChange={(e) => set('format', e.target.value as CalendarEntry['format'])}
              >
                {POST_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-pillar">Pilastro</Label>
              <select
                id="entry-pillar"
                className={selectClass}
                value={draft.pillarId ?? ''}
                onChange={(e) => set('pillarId', e.target.value || null)}
              >
                <option value="">Nessuno</option>
                {pillars.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entry-notes">Note / bozza</Label>
            <textarea
              id="entry-notes"
              className="border-input bg-background focus-visible:ring-ring min-h-28 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Scaletta, punti chiave, call to action…"
            />
          </div>

          {draft.status === 'pubblicato' && (
            <div className="space-y-1.5">
              <Label htmlFor="entry-url">Link al post</Label>
              <Input
                id="entry-url"
                type="url"
                value={draft.postUrl ?? ''}
                onChange={(e) => set('postUrl', e.target.value)}
                placeholder="https://www.linkedin.com/posts/…"
              />
              {stats ? (
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  Dall&apos;export: {formatNumber(stats.impressions)} impressioni ·{' '}
                  {formatNumber(stats.engagements)} interazioni
                  <a
                    href={stats.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary ml-1 inline-flex items-center"
                    aria-label="Apri il post"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </p>
              ) : (
                draft.postUrl && (
                  <p className="text-muted-foreground text-xs">
                    Nessuna metrica trovata: il post compare nell&apos;export solo se è tra i 50
                    migliori del periodo.
                  </p>
                )
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          {!isNew ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <Button variant="destructive" size="sm" onClick={() => onDelete(entry.id)}>
                  Conferma
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Annulla
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                Elimina
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit">Salva</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
