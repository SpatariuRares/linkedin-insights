// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { countMatched, ftsMatch, relatedTerms, searchTerms } from './search.ts';

describe('searchTerms', () => {
  it('lowercases, strips accents and drops Italian and English stopwords', () => {
    expect(searchTerms('Perché l’Europa e gli USA temono la Cina')).toEqual([
      'perche',
      'europa',
      'usa',
      'temono',
      'cina',
    ]);
    expect(searchTerms('The rise of the AI agents')).toEqual(['rise', 'ai', 'agents']);
  });

  it('dedupes and ignores punctuation-only input', () => {
    expect(searchTerms('chip, chip!')).toEqual(['chip']);
    expect(searchTerms(' — ? ')).toEqual([]);
  });
});

describe('relatedTerms', () => {
  it('keeps the distinctive words of a title, not numbers or generic news words', () => {
    expect(relatedTerms('Nvidia: new chip export ban to China in 2026, says report')).toEqual([
      'nvidia',
      'chip',
      'export',
      'ban',
      'china',
    ]);
  });
});

describe('ftsMatch', () => {
  it('requires every term for a search, as prefixes so partial words match', () => {
    expect(ftsMatch(['chip', 'taiwan'], 'all')).toBe('"chip"* "taiwan"*');
  });

  it('accepts any term for related articles, prefixing only longer words', () => {
    expect(ftsMatch(['ai', 'chips'], 'any')).toBe('"ai" OR "chips"*');
  });
});

describe('countMatched', () => {
  it('counts the terms found in a text, by word prefix and without accents', () => {
    expect(countMatched(['chip', 'cina', 'europa'], 'I chips della Cína')).toBe(2);
  });
});
