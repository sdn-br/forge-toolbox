import { describe, expect, it } from 'vitest';
import { ARMY_TAG, parseArmyCommand, parseArmyEvent } from '../src/shared/army-protocol';

const ask = (change: Record<string, unknown> = {}) => ({
  tag: ARMY_TAG,
  from: 'content',
  type: 'target',
  seq: 1,
  ...change,
});
const answer = (change: Record<string, unknown> = {}) => ({
  tag: ARMY_TAG,
  from: 'page',
  type: 'target',
  seq: 1,
  playerId: 5412792,
  ...change,
});

describe('parseArmyCommand (content to page)', () => {
  it('takes the ask', () => {
    expect(parseArmyCommand(ask())).toEqual(ask());
  });

  it.each([
    ['another tag', ask({ tag: 'forge-toolbox-marker' })],
    ['the page side', ask({ from: 'page' })],
    ['another type', ask({ type: 'show' })],
    ['no seq', ask({ seq: undefined })],
    ['a negative seq', ask({ seq: -1 })],
  ])('refuses %s', (_name, data) => {
    expect(parseArmyCommand(data)).toBeNull();
  });
});

describe('parseArmyEvent (page to content)', () => {
  it('takes the answer and copies only its fields', () => {
    expect(parseArmyEvent({ ...answer(), extra: 1 })).toEqual(answer());
  });

  it.each([
    ['the content side', answer({ from: 'content' })],
    ['no player', answer({ playerId: undefined })],
    ['player 0', answer({ playerId: 0 })],
    ['a fractional player', answer({ playerId: 1.5 })],
    ['a player as text', answer({ playerId: '5412792' })],
    ['no seq', answer({ seq: undefined })],
  ])('refuses %s', (_name, data) => {
    expect(parseArmyEvent(data)).toBeNull();
  });
});
