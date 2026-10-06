import { describe, expect, it } from 'vitest';
import {
  findPostStats,
  monthGrid,
  nextPillarSlot,
  postIdFromUrl,
  type CalendarEntry,
} from './calendar';

describe('monthGrid', () => {
  it('builds Monday-first weeks covering the month', () => {
    const weeks = monthGrid(2026, 9); // October 2026: Thu 1st .. Sat 31st
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe('2026-09-28');
    expect(weeks[0][3]).toBe('2026-10-01');
    expect(weeks.at(-1)!.at(-1)).toBe('2026-11-01');
  });

  it('handles a month starting on Monday', () => {
    expect(monthGrid(2026, 5)[0][0]).toBe('2026-06-01');
  });
});

describe('nextPillarSlot', () => {
  it('reuses the first free slot', () => {
    expect(
      nextPillarSlot([
        { id: 'a', name: 'A', slot: 1 },
        { id: 'c', name: 'C', slot: 3 },
      ]),
    ).toBe(2);
  });
});

describe('post matching', () => {
  const id = '7381234567890123456';
  const posts = [
    {
      url: `https://www.linkedin.com/posts/jane_ai-growth-share-${id}-AbCd`,
      day: '2026-10-01',
      engagements: 12,
      impressions: 800,
    },
  ];
  const entry = (postUrl: string | null): CalendarEntry => ({
    id: 'e',
    day: '2026-10-01',
    title: 't',
    notes: '',
    format: 'testo',
    pillarId: null,
    status: 'pubblicato',
    postUrl,
  });

  it('extracts the activity id from different URL shapes', () => {
    expect(postIdFromUrl(`https://www.linkedin.com/feed/update/urn:li:activity:${id}/`)).toBe(id);
    expect(postIdFromUrl('https://example.com')).toBeNull();
  });

  it('links a published entry to the export stats by id', () => {
    expect(
      findPostStats(entry(`https://www.linkedin.com/feed/update/urn:li:activity:${id}/`), posts)
        ?.impressions,
    ).toBe(800);
    expect(findPostStats(entry(null), posts)).toBeNull();
  });
});
