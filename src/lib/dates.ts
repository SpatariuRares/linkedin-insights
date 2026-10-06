/**
 * LinkedIn exports dates as plain D/M/Y-ish text, but which side is day and which is month
 * depends on the account's export locale (US export: "4/25/2026" = M/D/Y; PT-BR export:
 * "24/07/2025" = D/M/Y). We can't trust a fixed format, so we detect it per file: scan every
 * date string and see which position ever exceeds 12 — that side can only be the day.
 */
export type DateOrder = 'DMY' | 'MDY';

const DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/;

export function detectDateOrder(rawDates: string[]): DateOrder {
  let dmyVotes = 0;
  let mdyVotes = 0;
  for (const s of rawDates) {
    const m = s.match(DATE_RE);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) dmyVotes++;
    else if (b > 12) mdyVotes++;
  }
  if (mdyVotes > dmyVotes) return 'MDY';
  return 'DMY';
}

/**
 * Normalizes a raw export date string to an unambiguous local-time ISO string. The `T00:00:00`
 * suffix (no `Z`) matters: a bare "YYYY-MM-DD" is parsed as UTC midnight per spec, which rolls
 * back to the previous day in any negative-UTC-offset timezone (e.g. Brazil) once read locally.
 */
export function toIsoDate(raw: string, order: DateOrder): string {
  const m = raw.match(DATE_RE);
  if (!m) return raw;
  const [, a, b, y] = m;
  const day = order === 'DMY' ? a : b;
  const month = order === 'DMY' ? b : a;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`;
}

/** Pulls a trailing date (any separator/order) out of a label like "Total followers on 7/23/2026". */
export function extractTrailingDate(label: string): string | null {
  const m = label.match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*$/);
  return m ? m[1] : null;
}

/**
 * Day keys ("YYYY-MM-DD") are the unit for everything stored long-term (history, calendar). Math on
 * them goes through UTC so DST transitions never make a day 23 or 25 hours long.
 */
export function dayKey(isoOrDate: string | Date): string {
  if (isoOrDate instanceof Date) {
    const y = isoOrDate.getFullYear();
    const m = String(isoOrDate.getMonth() + 1).padStart(2, '0');
    const d = String(isoOrDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return isoOrDate.slice(0, 10);
}

function keyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  return new Date(keyToUtc(key) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86_400_000);
}

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const weekday = (new Date(keyToUtc(key)).getUTCDay() + 6) % 7;
  return addDays(key, -weekday);
}

/** Parses a day key as local midnight, the same convention `toIsoDate` uses. */
export function keyToLocalDate(key: string): Date {
  return new Date(`${key}T00:00:00`);
}
