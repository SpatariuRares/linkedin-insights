import { cn } from '../lib/utils';
import { PERIODS, type PeriodId } from '../lib/periods';

export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodId;
  onChange: (id: PeriodId) => void;
}) {
  return (
    <div
      className="bg-secondary inline-flex rounded-lg p-0.5"
      role="radiogroup"
      aria-label="Periodo"
    >
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          onClick={() => onChange(p.id)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === p.id
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
