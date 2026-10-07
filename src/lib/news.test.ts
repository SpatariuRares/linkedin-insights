import { describe, expect, it } from 'vitest';
import { formatRelative } from './news';

describe('formatRelative', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  it('uses relative words for recent times', () => {
    expect(formatRelative('2026-10-07T11:59:30Z', now)).toBe('adesso');
    expect(formatRelative('2026-10-07T09:00:00Z', now)).toBe('3 ore fa');
    expect(formatRelative('2026-10-06T12:00:00Z', now)).toBe('ieri');
  });
  it('falls back to a date after a week and handles missing values', () => {
    expect(formatRelative('2026-09-01T12:00:00Z', now)).toBe('1 set');
    expect(formatRelative(null, now)).toBe('—');
  });
});
