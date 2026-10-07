import type { Pillar } from '../../lib/calendar';
import { DEFAULT_FILTERS, type ArticleFilters } from '../../lib/news';
import { Button } from '../ui';

const selectClass =
  'border-input bg-background focus-visible:ring-ring h-8 rounded-md border px-2 text-xs shadow-sm focus-visible:ring-2 focus-visible:outline-none';

const RELEVANCE_OPTIONS = [
  { value: 0, label: 'Qualsiasi pertinenza' },
  { value: 1, label: 'Almeno poco pertinenti' },
  { value: 2, label: 'Almeno abbastanza' },
  { value: 3, label: 'Molto pertinenti' },
];

export function FiltersBar({
  filters,
  onChange,
  pillars,
}: {
  filters: ArticleFilters;
  onChange: (f: ArticleFilters) => void;
  pillars: Pillar[];
}) {
  const set = <K extends keyof ArticleFilters>(k: K, v: ArticleFilters[K]) =>
    onChange({ ...filters, [k]: v });
  const active = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtri">
      <select
        aria-label="Ordina"
        className={selectClass}
        value={filters.sort}
        onChange={(e) => set('sort', e.target.value as ArticleFilters['sort'])}
      >
        <option value="date">Più recenti</option>
        <option value="relevance">Più pertinenti</option>
      </select>
      <select
        aria-label="Pertinenza minima"
        className={selectClass}
        value={filters.minRelevance}
        onChange={(e) => set('minRelevance', Number(e.target.value))}
      >
        {RELEVANCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Pilastro"
        className={selectClass}
        value={filters.pillarId}
        onChange={(e) => set('pillarId', e.target.value)}
      >
        <option value="">Tutti i pilastri</option>
        {pillars.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          className="accent-primary size-3.5"
          checked={filters.postWorthyOnly}
          onChange={(e) => set('postWorthyOnly', e.target.checked)}
        />
        Solo spunti per un post
      </label>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)}>
          Azzera
        </Button>
      )}
    </div>
  );
}
