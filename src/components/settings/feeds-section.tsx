import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input } from '../ui';
import { api } from '../../lib/api';
import { formatRelative, type DiscoveredFeed, type Feed } from '../../lib/news';
import { cn } from '../../lib/utils';

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function AddFeedForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DiscoveredFeed[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSearching(true);
    setResults(null);
    try {
      const { feeds } = await api.discoverFeeds(url.trim());
      setResults(feeds);
      setTitles(Object.fromEntries(feeds.map((f) => [f.url, f.title ?? hostOf(f.url)])));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const add = async (feed: DiscoveredFeed) => {
    setAdding(feed.url);
    try {
      const res = await api.addFeed(feed.url, titles[feed.url]?.trim() || hostOf(feed.url));
      if (res.error)
        toast.warning(`Feed aggiunto, ma il primo scaricamento non è riuscito: ${res.error}`);
      else toast.success(`Feed aggiunto: ${res.added} articoli.`);
      setResults(
        (r) => r?.map((f) => (f.url === feed.url ? { ...f, alreadyAdded: true } : f)) ?? null,
      );
      onAdded();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <Input
          aria-label="Indirizzo del sito o del feed"
          placeholder="Indirizzo del sito o del feed, es. theverge.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button type="submit" disabled={searching || !url.trim()}>
          <Search className="size-3.5" />
          {searching ? 'Cerco…' : 'Cerca feed'}
        </Button>
      </form>

      {results && results.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nessun feed trovato su questo sito. Prova con l&apos;indirizzo diretto del feed (spesso
          termina con /feed o /rss.xml).
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {results.map((feed) => (
            <li key={feed.url} className="flex flex-wrap items-center gap-3 p-3">
              <Rss className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  aria-label={`Nome del feed ${feed.url}`}
                  className="h-8"
                  value={titles[feed.url] ?? ''}
                  disabled={feed.alreadyAdded}
                  onChange={(e) => setTitles((t) => ({ ...t, [feed.url]: e.target.value }))}
                />
                <p className="text-muted-foreground truncate font-mono text-xs">{feed.url}</p>
              </div>
              {feed.alreadyAdded ? (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Check className="size-3.5" /> Già aggiunto
                </span>
              ) : (
                <Button size="sm" onClick={() => add(feed)} disabled={adding !== null}>
                  <Plus className="size-3.5" />
                  {adding === feed.url ? 'Aggiungo…' : 'Aggiungi'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedRow({ feed, onChange }: { feed: Feed; onChange: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(feed.title);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn('space-y-2 p-4', !feed.enabled && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!title.trim()) return;
                void run(() => api.updateFeed(feed.id, { title: title.trim() }));
                setRenaming(false);
              }}
            >
              <Input
                aria-label="Nuovo nome"
                className="h-8"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
              />
              <Button type="submit" size="sm">
                Salva
              </Button>
            </form>
          ) : (
            <p className="text-foreground font-medium">
              {feed.title}
              {!feed.enabled && (
                <span className="text-muted-foreground ml-2 text-xs">in pausa</span>
              )}
            </p>
          )}
          <p className="text-muted-foreground truncate font-mono text-xs">{feed.url}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Aggiorna ${feed.title}`}
            disabled={busy || !feed.enabled}
            onClick={() =>
              run(async () => {
                const res = await api.refreshFeed(feed.id);
                if (res.error) toast.error(res.error);
                else toast.success(`${feed.title}: ${res.added} nuovi articoli.`);
              })
            }
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Rinomina ${feed.title}`}
            onClick={() => {
              setTitle(feed.title);
              setRenaming((r) => !r);
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={feed.enabled ? `Metti in pausa ${feed.title}` : `Riprendi ${feed.title}`}
            onClick={() => run(() => api.updateFeed(feed.id, { enabled: !feed.enabled }))}
          >
            {feed.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          {confirmDelete ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => run(() => api.deleteFeed(feed.id))}
              >
                Elimina
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Annulla
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Elimina ${feed.title}`}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {feed.articleCount} articoli · aggiornato {formatRelative(feed.lastFetchedAt)}
      </p>
      {feed.lastError && (
        <p className="flex items-start gap-1.5 text-xs">
          <AlertTriangle
            className="mt-px size-3.5 shrink-0"
            style={{ color: 'var(--status-serious)' }}
            aria-label="Errore"
          />
          <span className="text-foreground">
            {feed.errorCount >= 3 ? `Non funziona da ${feed.errorCount} tentativi: ` : ''}
            {feed.lastError}
          </span>
        </p>
      )}
    </li>
  );
}

function ImportOpmlButton({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const res = await api.importOpml(await file.text());
      const parts = [`${res.added} aggiunti`];
      if (res.existing) parts.push(`${res.existing} già presenti`);
      if (res.invalid) parts.push(`${res.invalid} non validi`);
      toast.success(`OPML importato: ${parts.join(' · ')}.`);
      onImported();
      // The new feeds are fetched in the background: refresh the list once that is likely done.
      if (res.added) setTimeout(onImported, 8000);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="size-3.5" />
        {busy ? 'Importo…' : 'Importa OPML'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".opml,.xml,text/xml,text/x-opml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
    </>
  );
}

export function FeedsSection() {
  const [feeds, setFeeds] = useState<Feed[] | null>(null);

  const load = useCallback(async () => {
    try {
      setFeeds(await api.listFeeds());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-foreground font-medium">Feed RSS</h2>
          <p className="text-muted-foreground text-xs">
            Incolla l&apos;indirizzo di un sito: trovo io il suo feed. Oppure importa l&apos;OPML
            esportato da Feedly, Inoreader o simili.
          </p>
        </div>
        <ImportOpmlButton onImported={load} />
      </div>
      <AddFeedForm onAdded={load} />
      {feeds && feeds.length > 0 && (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {feeds.map((feed) => (
            <FeedRow key={feed.id} feed={feed} onChange={load} />
          ))}
        </ul>
      )}
      {feeds && feeds.length === 0 && (
        <p className="text-muted-foreground text-sm">Ancora nessun feed.</p>
      )}
    </Card>
  );
}
