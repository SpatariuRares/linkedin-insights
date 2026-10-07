import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, Label } from '../ui';
import { api } from '../../lib/api';
import { MAX_EXAMPLES, type Voice } from '../../lib/voice';

const areaClass =
  'border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none';

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      <textarea
        id={id}
        rows={rows}
        className={areaClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function VoiceSection() {
  const [voice, setVoice] = useState<Voice | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getVoice().then(
      (v) => {
        setVoice(v);
        setSaved(JSON.stringify(v));
      },
      (err) => toast.error(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  if (!voice) return null;
  const dirty = JSON.stringify(voice) !== saved;
  const set = <K extends keyof Voice>(k: K, v: Voice[K]) => setVoice({ ...voice, [k]: v });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const next = await api.putVoice({
        ...voice,
        examples: voice.examples.filter((x) => x.trim()),
      });
      setVoice(next);
      setSaved(JSON.stringify(next));
      toast.success('Voce salvata.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <form onSubmit={save} className="space-y-5">
        <div>
          <h2 className="text-foreground font-medium">La tua voce</h2>
          <p className="text-muted-foreground text-xs">
            L&apos;agente legge questa sezione ogni volta che scrive: più è precisa, meno il post
            sembra generico.
          </p>
        </div>

        <Field
          id="voice-about"
          label="Chi sei"
          hint="Ruolo, esperienza, cosa vuoi che le persone associno al tuo nome."
          value={voice.about}
          onChange={(v) => set('about', v)}
          placeholder="Product manager da 8 anni nel fintech. Voglio essere riconosciuto per…"
        />
        <Field
          id="voice-audience"
          label="Per chi scrivi"
          value={voice.audience}
          onChange={(v) => set('audience', v)}
          rows={2}
          placeholder="Altri sviluppatori, tech lead, recruiter di aziende prodotto…"
        />
        <Field
          id="voice-style"
          label="Regole di stile"
          hint="Lunghezza, emoji, hashtag, tono, frasi da evitare."
          value={voice.styleRules}
          onChange={(v) => set('styleRules', v)}
          rows={4}
          placeholder={
            'Massimo 1.300 caratteri. Niente emoji. Al massimo 3 hashtag a fine post.\nEvita: "Ecco 5 lezioni", "game changer", "Non è X, è Y".'
          }
        />
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="voice-language">Lingua dei post</Label>
          <Input
            id="voice-language"
            value={voice.language}
            onChange={(e) => set('language', e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-foreground text-sm font-medium">Post di esempio</p>
            <p className="text-muted-foreground text-xs">
              Incolla da 3 a {MAX_EXAMPLES} tuoi post, meglio quelli andati bene: l&apos;agente ne
              imita lo stile, non il contenuto.
            </p>
          </div>
          {voice.examples.map((ex, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                aria-label={`Post di esempio ${i + 1}`}
                rows={5}
                className={areaClass}
                value={ex}
                onChange={(e) =>
                  set(
                    'examples',
                    voice.examples.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Togli l'esempio ${i + 1}`}
                onClick={() =>
                  set(
                    'examples',
                    voice.examples.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          {voice.examples.length < MAX_EXAMPLES && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => set('examples', [...voice.examples, ''])}
            >
              <Plus className="size-3.5" /> Aggiungi un esempio
            </Button>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-muted-foreground text-xs">Modifiche non salvate</span>}
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? 'Salvo…' : 'Salva voce'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
