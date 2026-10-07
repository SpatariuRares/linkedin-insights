import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Pencil, Plus, Star, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, Label } from '../ui';
import { api } from '../../lib/api';
import {
  AVAILABLE_KINDS,
  KIND_LABELS,
  PRESETS,
  groupModels,
  modelLabel,
  nameAfterModelChange,
  type ModelInfo,
  type Profile,
  type ProfileInput,
  type ProfileKind,
  type ProfileTest,
} from '../../lib/profiles';

const selectClass =
  'border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none';

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Every model the provider lists, grouped by provider, with a search box to narrow ~500 entries. */
function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const groups = groupModels(models, query, value);
  const shown = groups.reduce((n, g) => n + g.models.length, 0);

  return (
    <div className="space-y-1.5">
      <Input
        type="search"
        aria-label="Cerca modello"
        placeholder="Cerca: claude, gpt, gemini, gratis…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        id="profile-model"
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        {!value && <option value="">Scegli un modello…</option>}
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.models.map((m) => (
              <option key={m.id} value={m.id}>
                {modelLabel(m)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="text-muted-foreground text-xs">
        {query.trim() ? `${shown} di ${models.length} modelli` : `${models.length} modelli`} ·
        prezzi in dollari per milione di token (ingresso / uscita)
      </p>
    </div>
  );
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ProfileInput;
  onSave: (p: ProfileInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ProfileInput>(initial);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [manual, setManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const isHttp = draft.kind === 'openai-compatible';

  useEffect(() => {
    if (!isHttp || !draft.baseUrl) return;
    const baseUrl = draft.baseUrl;
    const t = setTimeout(() => {
      api.listModels(baseUrl).then(
        (r) => setModels(r.models),
        () => setModels([]),
      );
    }, 400);
    return () => clearTimeout(t);
  }, [draft.baseUrl, isHttp]);

  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const chooseModel = (id: string) => {
    const next = models.find((m) => m.id === id);
    setDraft((d) => ({
      ...d,
      model: id,
      name: next ? nameAfterModelChange(d.name, d.model, next, models) : d.name,
    }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...draft,
        baseUrl: isHttp ? draft.baseUrl?.trim() || null : null,
        apiKeyEnv: isHttp ? draft.apiKeyEnv?.trim() || null : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-secondary/40 space-y-4 rounded-lg p-4">
      <div className="flex flex-wrap gap-2">
        <span className="text-muted-foreground self-center text-xs">Parti da:</span>
        {PRESETS.map((p) => (
          <Button key={p.label} size="sm" variant="outline" onClick={() => setDraft(p.value)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Nome</Label>
          <Input
            id="profile-name"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-kind">Tipo</Label>
          <select
            id="profile-kind"
            className={selectClass}
            value={draft.kind}
            onChange={(e) => set('kind', e.target.value as ProfileKind)}
          >
            {(Object.keys(KIND_LABELS) as ProfileKind[]).map((k) => (
              <option key={k} value={k} disabled={!AVAILABLE_KINDS.includes(k)}>
                {KIND_LABELS[k]}
                {AVAILABLE_KINDS.includes(k) ? '' : ' — in arrivo'}
              </option>
            ))}
          </select>
        </div>
        {isHttp && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="profile-url">URL di base</Label>
            <Input
              id="profile-url"
              type="url"
              value={draft.baseUrl ?? ''}
              onChange={(e) => set('baseUrl', e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              required
            />
          </div>
        )}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="profile-model">Modello</Label>
            {isHttp && models.length > 0 && (
              <button
                type="button"
                className="text-primary text-xs underline"
                onClick={() => setManual((m) => !m)}
              >
                {manual ? "Scegli dall'elenco" : 'Scrivi a mano'}
              </button>
            )}
          </div>
          {isHttp && models.length > 0 && !manual ? (
            <ModelPicker models={models} value={draft.model} onChange={chooseModel} />
          ) : (
            <Input
              id="profile-model"
              value={draft.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder={
                isHttp ? 'anthropic/claude-sonnet-5.5' : 'vuoto = modello predefinito della CLI'
              }
              required={isHttp}
            />
          )}
        </div>
        {isHttp && (
          <div className="space-y-1.5">
            <Label htmlFor="profile-key">Variabile della chiave in .env</Label>
            <Input
              id="profile-key"
              value={draft.apiKeyEnv ?? ''}
              onChange={(e) => set('apiKeyEnv', e.target.value.toUpperCase())}
              placeholder="OPENROUTER_API_KEY (vuoto se non serve)"
            />
          </div>
        )}
      </div>
      {!isHttp && (
        <p className="text-muted-foreground text-xs">
          Usa il tuo abbonamento tramite la CLI già installata e autenticata su questo Mac (es.{' '}
          <span className="font-mono">codex login</span>). Nessuna chiave da configurare.
        </p>
      )}
      <p className={isHttp ? 'text-muted-foreground text-xs' : 'hidden'}>
        La chiave non si scrive qui: mettila nel file <span className="font-mono">.env</span> del
        progetto (es. <span className="font-mono">OPENROUTER_API_KEY=sk-…</span>) e riavvia il
        server.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Salvo…' : 'Salva'}
        </Button>
      </div>
    </form>
  );
}

function TestResult({ result }: { result: ProfileTest }) {
  return result.ok ? (
    <p className="flex items-start gap-1.5 text-xs">
      <CheckCircle2
        className="mt-px size-3.5 shrink-0"
        style={{ color: 'var(--status-good)' }}
        aria-label="Riuscito"
      />
      <span className="text-foreground">
        Funziona: {result.model} ha risposto «{result.text}» in{' '}
        {(result.ms / 1000).toFixed(1).replace('.', ',')} s.
      </span>
    </p>
  ) : (
    <p className="flex items-start gap-1.5 text-xs">
      <AlertTriangle
        className="mt-px size-3.5 shrink-0"
        style={{ color: 'var(--status-serious)' }}
        aria-label="Errore"
      />
      <span className="text-foreground">{result.error}</span>
    </p>
  );
}

export function ProfilesSection() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [tests, setTests] = useState<Record<number, ProfileTest | 'running'>>({});

  const load = useCallback(async () => {
    try {
      setProfiles(await api.listProfiles());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (input: ProfileInput, id?: number) => {
    try {
      if (id) await api.updateProfile(id, input);
      else await api.createProfile(input);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const test = async (id: number) => {
    setTests((t) => ({ ...t, [id]: 'running' }));
    try {
      const result = await api.testProfile(id);
      setTests((t) => ({ ...t, [id]: result }));
    } catch (err) {
      setTests((t) => ({ ...t, [id]: { ok: false, error: errorMessage(err), ms: 0 } }));
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-foreground font-medium">Modelli per scrivere</h2>
          <p className="text-muted-foreground text-xs">
            I profili che l&apos;agente può usare. Quello con la stella è il predefinito.
          </p>
        </div>
        {editing !== 'new' && (
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" /> Nuovo profilo
          </Button>
        )}
      </div>

      {editing === 'new' && (
        <ProfileForm
          initial={PRESETS[0].value}
          onSave={(p) => save(p)}
          onCancel={() => setEditing(null)}
        />
      )}

      {profiles?.length === 0 && editing !== 'new' && (
        <p className="text-muted-foreground text-sm">
          Nessun profilo. Il modo più veloce: «Nuovo profilo» → OpenRouter, poi la chiave in .env.
        </p>
      )}

      {profiles && profiles.length > 0 && (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {profiles.map((p) => {
            const t = tests[p.id];
            return (
              <li key={p.id} className="space-y-2 p-4">
                {editing === p.id ? (
                  <ProfileForm
                    initial={p}
                    onSave={(input) => save(input, p.id)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground flex items-center gap-1.5 font-medium">
                          {p.isDefault && (
                            <Star className="size-3.5 fill-current" aria-label="Predefinito" />
                          )}
                          {p.name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {KIND_LABELS[p.kind]} ·{' '}
                          <span className="font-mono">{p.model || '—'}</span>
                        </p>
                        {p.apiKeyEnv && (
                          <p className="text-muted-foreground text-xs">
                            Chiave <span className="font-mono">{p.apiKeyEnv}</span>:{' '}
                            {p.keyPresent ? 'trovata in .env' : 'non trovata in .env'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => test(p.id)}
                          disabled={t === 'running'}
                        >
                          <Zap className="size-3.5" />
                          {t === 'running' ? 'Provo…' : 'Prova'}
                        </Button>
                        {!p.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Rendi predefinito ${p.name}`}
                            title="Rendi predefinito"
                            onClick={() => run(() => api.setDefaultProfile(p.id))}
                          >
                            <Star className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Modifica ${p.name}`}
                          onClick={() => setEditing(p.id)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Elimina ${p.name}`}
                          onClick={() => run(() => api.deleteProfile(p.id))}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    {t && t !== 'running' && <TestResult result={t} />}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
