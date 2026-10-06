import { describe, expect, it } from 'vitest';
import { defaultState, parseState } from './storage';

describe('parseState', () => {
  it('round-trips the default state', () => {
    const state = defaultState();
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });

  it('rejects a file that is not a backup', () => {
    expect(() => parseState('{"foo":1}')).toThrow();
  });
});
