import { CheckCircle2, Clock, Lightbulb, PenLine } from 'lucide-react';
import { POST_STATUSES, type PostStatus } from '../../lib/calendar';
import { cn } from '../../lib/utils';

const ICONS = { idea: Lightbulb, bozza: PenLine, programmato: Clock, pubblicato: CheckCircle2 };

export function StatusIcon({ status, className }: { status: PostStatus; className?: string }) {
  const Icon = ICONS[status];
  const label = POST_STATUSES.find((s) => s.id === status)!.label;
  return (
    <Icon
      className={cn('text-muted-foreground size-3.5 shrink-0', className)}
      aria-label={label}
      role="img"
    />
  );
}

export function PillarDot({ slot }: { slot: number | null }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: slot ? `var(--series-${slot})` : 'var(--chart-baseline)' }}
      aria-hidden
    />
  );
}
