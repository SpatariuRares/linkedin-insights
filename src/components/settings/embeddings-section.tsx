import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, Label } from '../ui';
import { api } from '../../lib/api';
import { EMBEDDING_MODELS, type EmbeddingConfig, type EmbeddingStatus } from '../../lib/embeddings';

const selectClass =
  'border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none';

const configOf = (s: EmbeddingStatus): EmbeddingConfig => ({
  enabled: s.enabled,
  baseUrl: s.baseUrl,
  apiKeyEnv: s.apiKeyEnv,
  model: s.model,
});

/** Search by meaning: which embedding model indexes the news, and how far indexing has got. */
export function EmbeddingsSection() {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [draft, setDraft] = useState<EmbeddingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.embeddingStatus().then(
      (s) => {
        setStatus(s);
        setDraft(configOf(s));
      },
      (err) => toast.error(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  // While indexing, refresh the progress every few seconds.
  const busy = Boolean(
    status?.enabled && (status.running || status.pending > 0) && !status.lastError,
  );
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      api.embeddingStatus().then(setStatus, () => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [busy]);

  if (!status || !draft) return null;
  const saved = configOf(status);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const modelChanged = draft.model !== saved.model;
  const total = status.embedded + status.pending;
  const known = EMBEDDING_MODELS.some((m) => m.id === draft.model);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const next = await api.putEmbeddingConfig({
        ...draft,
        apiKeyEnv: draft.apiKeyEnv?.trim() || null,
      });
      setStatus(next);
      setDraft(configOf(next));
      toast.success(
        next.enabled
          ? 'Impostazioni salvate: indicizzo le news.'
          : 'Ricerca per significato disattivata.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    try {
      setStatus(await api.runEmbeddings());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card className="p-5">
      <form onSubmit={save} className="space-y-5">
        <div>
          <h2 className="text-foreground font-medium">Ricerca per significato</h2>
          <p className="text-muted-foreground text-xs">
            Ogni news viene trasformata in un embedding: così «Collegate» e il grafo degli argomenti
            trovano la stessa notizia anche in un&apos;altra lingua o scritta con parole diverse.
            Senza, l&apos;app confronta le parole dei titoli.
          </p>
        </div>

        <label className="text-foreground inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Attiva la ricerca per significato
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="embedding-model">Modello</Label>
            <select
              id="embedding-model"
              className={selectClass}
              value={known ? draft.model : '__custom'}
              onChange={(e) =>
                setDraft({ ...draft, model: e.target.value === '__custom' ? '' : e.target.value })
              }
            >
              {EMBEDDING_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="__custom">Altro modello…</option>
            </select>
            {!known && (
              <Input
                aria-label="Nome del modello"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="es. intfloat/multilingual-e5-large"
                required
              />
            )}
            {modelChanged && (
              <p className="text-muted-foreground text-xs">
                Cambiando modello tutte le news vengono indicizzate di nuovo.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="embedding-url">URL di base</Label>
            <Input
              id="embedding-url"
              type="url"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="embedding-key">Variabile della chiave in .env</Label>
            <Input
              id="embedding-key"
              value={draft.apiKeyEnv ?? ''}
              onChange={(e) => setDraft({ ...draft, apiKeyEnv: e.target.value })}
              placeholder="OPENROUTER_API_KEY (vuoto se non serve)"
            />
          </div>
        </div>

        <div className="border-border space-y-2 rounded-lg border p-3">
          {!status.enabled ? (
            <p className="text-muted-foreground text-sm">
              Disattivata: «Collegate» e grafo usano le parole dei titoli.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-foreground text-sm">
                  {status.embedded} di {total} news indicizzate
                  {status.running ? ' · indicizzazione in corso…' : ''}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={runNow}
                  disabled={status.running || status.pending === 0}
                >
                  <RefreshCw className={status.running ? 'size-3.5 animate-spin' : 'size-3.5'} />
                  Indicizza ora
                </Button>
              </div>
              <div
                className="bg-secondary h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={status.embedded}
                aria-label="News indicizzate"
              >
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${total ? (status.embedded / total) * 100 : 100}%` }}
                />
              </div>
              {status.keyPresent === false && (
                <p className="text-destructive text-xs">
                  La variabile {status.apiKeyEnv} non è nel file .env: aggiungila e riavvia il
                  server.
                </p>
              )}
              {status.lastError && status.keyPresent !== false && (
                <p className="text-destructive text-xs">{status.lastError}</p>
              )}
              <p className="text-muted-foreground text-xs">
                Le news nuove vengono indicizzate da sole dopo ogni aggiornamento dei feed. Si invia
                al provider solo titolo e riassunto delle news.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? 'Salvo…' : 'Salva'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
