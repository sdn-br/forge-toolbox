import { describe, expect, it } from 'vitest';
import { ALL_REACH, passesReach, REACH_ORDER, reasonsOf } from '../src/content/domain/reach';

const none = { neighbor: false, friend: false, guildMember: false };
const off = { neighbor: false, friend: false, guildMember: false, none: false };

describe('reasonsOf', () => {
  it('lists the relations in the fixed order', () => {
    expect(reasonsOf({ neighbor: true, friend: true, guildMember: true })).toEqual([
      'neighbor',
      'friend',
      'guildMember',
    ]);
    expect(reasonsOf({ ...none, guildMember: true })).toEqual(['guildMember']);
  });

  it('says none without any relation and unknown without relations at all', () => {
    expect(reasonsOf(none)).toEqual(['none']);
    expect(reasonsOf(undefined)).toEqual(['unknown']);
  });

  it('sorts reachable reasons before unknown and none', () => {
    expect(REACH_ORDER.indexOf('guildMember')).toBeLessThan(REACH_ORDER.indexOf('unknown'));
    expect(REACH_ORDER.indexOf('unknown')).toBeLessThan(REACH_ORDER.indexOf('none'));
  });
});

describe('passesReach', () => {
  it('lets a row through when one of its reasons is on', () => {
    expect(passesReach(['neighbor', 'friend'], { ...off, friend: true })).toBe(true);
    expect(passesReach(['neighbor'], { ...off, friend: true })).toBe(false);
    expect(passesReach(['none'], { ...off, none: true })).toBe(true);
    expect(passesReach(['none'], { ...ALL_REACH, none: false })).toBe(false);
  });

  it('always lets an unknown player through', () => {
    expect(passesReach(['unknown'], off)).toBe(true);
  });
});
