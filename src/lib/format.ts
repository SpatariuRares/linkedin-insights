const numberFmt = new Intl.NumberFormat('it-IT');
const compactFmt = new Intl.NumberFormat('it-IT', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatNumber(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return numberFmt.format(n);
}

export function formatCompact(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return compactFmt.format(n);
}

export function formatPercent(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)}%`;
}

export function formatDateShort(date: string | Date) {
  const d = date instanceof Date ? date : new Date(date.length === 10 ? `${date}T00:00:00` : date);
  if (Number.isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(d);
}

export function formatDateLong(date: string | Date) {
  const d = date instanceof Date ? date : new Date(date.length === 10 ? `${date}T00:00:00` : date);
  if (Number.isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function formatMonth(date: Date) {
  return new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' }).format(date);
}
