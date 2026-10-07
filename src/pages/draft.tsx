import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  History,
  Link2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, Label } from '../components/ui';
import type { CalendarState } from '../lib/calendar';
import { api } from '../lib/api';
import { LINKEDIN_MAX_CHARS, QUICK_REVISIONS, replaceFirstLine, type Draft } from '../lib/drafts';
import { formatRelative } from '../lib/news';
import { formatNumber } from '../lib/format';
import { cn } from '../lib/utils';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiato negli appunti.`);
  } catch {
    toast.error('Il browser non ha permesso di copiare: seleziona il testo e copialo a mano.');
  }
}

const selectClass =
  'border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none';

function SaveToCalendar({
  draft,
  text,
  calendar,
  onSaved,
}: {
  draft: Draft;
  text: string;
  calendar: CalendarState;
  onSaved: (d: Draft) => void;
}) {
  const entry = calendar.entries.find((e) => e.id === draft.calendarEntryId);
  const [pillarId, setPillarId] = useState<string>(entry?.pillarId ?? '');
  const [day, setDay] = useState<string>(entry?.day ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.saveDraftToCalendar(draft.id, {
        text,
        pillarId: pillarId || null,
        // An existing entry keeps the day it has in the calendar unless one is picked here.
        day: entry && !day ? undefined : day || null,
      });
      toast.success(entry ? 'Contenuto aggiornato nel calendario.' : 'Salvato nel calendario.');
      onSaved(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-foreground flex items-center gap-1.5 text-sm font-medium">
        <CalendarPlus className="size-4" /> Calendario
      </h2>
      <div className="space-y-1.5">
        <Label htmlFor="draft-pillar">Pilastro</Label>
        <select
          id="draft-pillar"
          className={selectClass}
          value={pillarId}
          onChange={(e) => setPillarId(e.target.value)}
        >
          <option value="">Nessuno</option>
          {calendar.pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="draft-day">Data (facoltativa)</Label>
        <Input id="draft-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <p className="text-muted-foreground text-xs">
          Senza data finisce nell&apos;archivio idee, da trascinare poi su un giorno.
        </p>
      </div>
      <Button className="w-full" onClick={save} disabled={saving}>
        {saving ? 'Salvo…' : entry ? 'Aggiorna nel calendario' : 'Salva come bozza nel calendario'}
      </Button>
    </Card>
  );
}

export function DraftPage({
  draftId,
  onBack,
  calendar,
  onSaved,
}: {
  draftId: number;
  onBack: () => void;
  calendar: CalendarState;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.getDraft(draftId);
      setDraft(d);
      setText(d.text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Every edit is saved shortly after typing stops, so a revision always sees the latest text.
  const edit = (next: string) => {
    setText(next);
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.saveDraftText(draftId, next);
        setSaveState('saved');
      } catch (err) {
        setSaveState('dirty');
        toast.error(err instanceof Error ? err.message : 'Salvataggio non riuscito.');
      }
    }, 600);
  };

  const revise = async (request: string) => {
    if (!request.trim()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setRevising(request);
    try {
      const next = await api.reviseDraft(draftId, { instruction: request.trim(), text });
      setDraft(next);
      setText(next.text);
      setSaveState('saved');
      setInstruction('');
      toast.success(`Versione ${next.versions.at(-1)!.n} pronta.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRevising(null);
    }
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (!draft) return <p className="text-muted-foreground text-sm">Caricamento…</p>;

  const latest = draft.versions.at(-1)!;
  const partial = draft.sources.filter((s) => s.fullText === false);
  const over = text.length > LINKEDIN_MAX_CHARS;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5" /> Indietro
        </Button>
        <p className="text-muted-foreground text-xs">
          {latest.model ?? draft.profileName}
          {latest.usage.inputTokens !== null &&
            ` · ${formatNumber(latest.usage.inputTokens)} token in, ${formatNumber(latest.usage.outputTokens ?? 0)} out`}
        </p>
      </div>

      {partial.length > 0 && (
        <p className="bg-secondary flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            style={{ color: 'var(--status-serious)' }}
            aria-label="Attenzione"
          />
          <span className="text-foreground">
            Di {partial.map((s) => `«${s.title}»`).join(', ')} ho potuto leggere solo il riassunto
            del feed: controlla i dettagli prima di pubblicare.
          </span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-display text-foreground text-lg font-medium">Bozza</h1>
              <span className="text-muted-foreground text-xs">
                {saveState === 'saved' ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="size-3" /> Salvata
                  </span>
                ) : saveState === 'saving' ? (
                  'Salvo…'
                ) : (
                  'Modifiche in corso'
                )}
              </span>
            </div>
            <textarea
              aria-label="Testo del post"
              className="border-input bg-background focus-visible:ring-ring min-h-80 w-full rounded-md border px-3 py-2 text-[15px] leading-relaxed shadow-sm focus-visible:ring-2 focus-visible:outline-none"
              value={text}
              onChange={(e) => edit(e.target.value)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={cn('text-xs', over ? 'text-destructive' : 'text-muted-foreground')}>
                {formatNumber(text.length)} / {formatNumber(LINKEDIN_MAX_CHARS)} caratteri
                {over && ' — troppo lungo per LinkedIn'}
              </span>
              <Button onClick={() => copy(text, 'Testo')}>
                <Copy className="size-3.5" /> Copia testo
              </Button>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-foreground flex items-center gap-1.5 text-sm font-medium">
              <Wand2 className="size-4" /> Cosa cambio?
            </h2>
            <div className="flex flex-wrap gap-2">
              {QUICK_REVISIONS.map((q) => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  disabled={revising !== null}
                  onClick={() => revise(q)}
                >
                  {revising === q ? 'Riscrivo…' : q}
                </Button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void revise(instruction);
              }}
            >
              <Input
                aria-label="Richiesta di modifica"
                placeholder="Es. togli il riferimento al mio ex lavoro, chiudi con una domanda"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={revising !== null}
              />
              <Button type="submit" disabled={revising !== null || !instruction.trim()}>
                {revising === instruction && instruction ? 'Riscrivo…' : 'Riscrivi'}
              </Button>
            </form>
            <p className="text-muted-foreground text-xs">
              La revisione parte dal testo che vedi, comprese le tue modifiche, e crea una nuova
              versione: le precedenti restano nella cronologia.
            </p>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-foreground text-sm font-medium">Hook alternativi</h2>
            <p className="text-muted-foreground text-xs">
              Clicca per sostituire la prima riga del post.
            </p>
            <ul className="space-y-2">
              {latest.hooks.map((hook) => (
                <li key={hook}>
                  <button
                    type="button"
                    onClick={() => edit(replaceFirstLine(text, hook))}
                    className="border-border hover:border-ring w-full rounded-md border px-3 py-2 text-left text-sm"
                  >
                    {hook}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {latest.variants.map((v, i) => (
              <Card key={i} className="flex flex-col gap-3 p-4">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Variante {i + 1}
                  {v.angle ? ` · ${v.angle}` : ''}
                </p>
                <p className="text-foreground line-clamp-[12] flex-1 text-sm whitespace-pre-line">
                  {v.text}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={text === v.text}
                  onClick={() => edit(v.text)}
                >
                  {text === v.text ? 'In uso' : 'Usa questa variante'}
                </Button>
              </Card>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <SaveToCalendar
            key={draft.calendarEntryId ?? 'new'}
            draft={draft}
            text={text}
            calendar={calendar}
            onSaved={(next) => {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              setDraft(next);
              setSaveState('saved');
              onSaved();
            }}
          />
          <Card className="space-y-3 p-4">
            <h2 className="text-foreground text-sm font-medium">Fonti</h2>
            <ul className="space-y-3">
              {draft.sources.map((s) => (
                <li key={s.articleId} className="space-y-1">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground inline-flex items-start gap-1 text-sm hover:underline"
                  >
                    {s.title}
                    <ExternalLink className="text-muted-foreground mt-1 size-3 shrink-0" />
                  </a>
                  <p className="text-muted-foreground flex items-center gap-2 text-xs">
                    {s.source}
                    {s.fullText === false && ' · solo riassunto'}
                    <button
                      type="button"
                      className="text-primary inline-flex items-center gap-1"
                      onClick={() => copy(s.url, 'Link')}
                    >
                      <Link2 className="size-3" /> copia link
                    </button>
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Metti il link nel primo commento: i post con link esterni nel testo vengono mostrati a
              meno persone.
            </p>
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="text-foreground flex items-center gap-1.5 text-sm font-medium">
              <History className="size-4" /> Versioni
            </h2>
            <ol className="space-y-2">
              {[...draft.versions].reverse().map((v) => {
                const versionText = v.variants[0].text;
                return (
                  <li key={v.id} className="flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-foreground font-medium">
                        v{v.n} · {v.instruction ?? 'Prima bozza'}
                      </p>
                      <p className="text-muted-foreground">{formatRelative(v.createdAt)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={text === versionText}
                      onClick={() => edit(versionText)}
                    >
                      {text === versionText ? 'In uso' : 'Ripristina'}
                    </Button>
                  </li>
                );
              })}
            </ol>
          </Card>
          {draft.thought && (
            <Card className="space-y-2 p-4">
              <h2 className="text-foreground text-sm font-medium">Il tuo pensiero</h2>
              <p className="text-muted-foreground text-sm whitespace-pre-line">{draft.thought}</p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
