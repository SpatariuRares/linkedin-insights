import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Label } from '../ui';
import { api } from '../../lib/api';
import type { Profile } from '../../lib/profiles';

const selectClass =
  'border-input bg-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none';

export function CreatePostPanel({
  articleIds,
  onClear,
  onCreated,
  onOpenSettings,
}: {
  articleIds: number[];
  onClear: () => void;
  onCreated: (draftId: number) => void;
  onOpenSettings: () => void;
}) {
  const [thought, setThought] = useState('');
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listProfiles().then(
      (list) => {
        setProfiles(list);
        setProfileId(list.find((p) => p.isDefault)?.id ?? list[0]?.id ?? null);
      },
      () => setProfiles([]),
    );
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const draft = await api.createDraft({
        articleIds,
        thought: thought.trim(),
        profileId: profileId ?? undefined,
      });
      toast.success('Bozza pronta.');
      onCreated(draft.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="sticky bottom-4 z-10 space-y-3 p-4 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <p className="text-foreground text-sm font-medium">
          Crea un post da {articleIds.length} news
        </p>
        <Button variant="ghost" size="sm" onClick={onClear} aria-label="Annulla selezione">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="post-thought">Il tuo pensiero veloce</Label>
        <textarea
          id="post-thought"
          rows={3}
          className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
          placeholder="Cosa ne pensi? Es. «Utile, ma nei progetti grandi la migrazione costa più di quanto dicono»"
          value={thought}
          onChange={(e) => setThought(e.target.value)}
        />
      </div>
      {profiles?.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Serve un modello per scrivere.{' '}
          <button type="button" className="text-primary underline" onClick={onOpenSettings}>
            Configuralo nelle Impostazioni
          </button>
          .
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="post-profile">Modello</Label>
            <select
              id="post-profile"
              className={selectClass}
              value={profileId ?? ''}
              onChange={(e) => setProfileId(Number(e.target.value))}
            >
              {profiles?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? ' (predefinito)' : ''}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={create} disabled={busy || !profileId}>
            <Sparkles className="size-3.5" />
            {busy ? 'Leggo le fonti e scrivo…' : 'Crea post'}
          </Button>
        </div>
      )}
      {busy && (
        <p className="text-muted-foreground text-xs">
          Può richiedere fino a un minuto: scarico gli articoli completi e poi il modello scrive.
        </p>
      )}
    </Card>
  );
}
