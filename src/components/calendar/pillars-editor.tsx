import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '../ui';
import { MAX_PILLARS, newId, nextPillarSlot, type Pillar } from '../../lib/calendar';
import { PillarDot } from './status-icon';

export function PillarsEditor({
  pillars,
  usage,
  onChange,
}: {
  pillars: Pillar[];
  usage: Map<string, number>;
  onChange: (pillars: Pillar[]) => void;
}) {
  const [name, setName] = useState('');
  const slot = nextPillarSlot(pillars);

  const add = () => {
    if (!name.trim() || slot === null) return;
    onChange([...pillars, { id: newId(), name: name.trim(), slot }]);
    setName('');
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {pillars.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <PillarDot slot={p.slot} />
            <Input
              aria-label={`Nome pilastro ${p.name}`}
              className="h-8"
              value={p.name}
              onChange={(e) =>
                onChange(pillars.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))
              }
            />
            <span className="text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums">
              {usage.get(p.id) ?? 0}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Elimina ${p.name}`}
              onClick={() => onChange(pillars.filter((x) => x.id !== p.id))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      {pillars.length < MAX_PILLARS && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            className="h-8"
            placeholder="Nuovo pilastro"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="outline" size="sm" aria-label="Aggiungi pilastro">
            <Plus className="size-3.5" />
          </Button>
        </form>
      )}
    </div>
  );
}
