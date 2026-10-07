import { describe, expect, it } from 'vitest';
import { replaceFirstLine } from './drafts';

describe('replaceFirstLine', () => {
  it('swaps only the opening line', () => {
    expect(replaceFirstLine('Vecchio hook\n\nCorpo del post', 'Nuovo hook')).toBe(
      'Nuovo hook\n\nCorpo del post',
    );
  });
  it('handles a single-line text', () => {
    expect(replaceFirstLine('Solo una riga', 'Hook')).toBe('Hook');
  });
});
