import { describe, expect, it } from 'vitest';
import { ALL_REACH, leadReason, passesReach, REACH_ORDER, REACH_TOGGLES, reasonsOf } from '../src/content/domain/reach';

const none = { neighbor: false, friend: false, guildMember: false };
const off = { neighbor: false, friend: false, guildMember: false, invited: false, none: false };

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

  it('adds an open invitation after the relations, and no none for an invitation alone', () => {
    expect(reasonsOf({ ...none, neighbor: true }, true)).toEqual(['neighbor', 'invited']);
    expect(reasonsOf(none, true)).toEqual(['invited']);
    expect(reasonsOf(none, false)).toEqual(['none']);
    expect(reasonsOf(undefined, true)).toEqual(['unknown', 'invited']);
  });

  it('ranks an invitation alone like none', () => {
    expect(leadReason(['invited'])).toBe('none');
    expect(leadReason(['friend', 'invited'])).toBe('friend');
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

  it('filters by the invitation with its own toggle, none does not cover it', () => {
    expect(passesReach(['invited'], { ...off, invited: true })).toBe(true);
    expect(passesReach(['invited'], { ...ALL_REACH, invited: false })).toBe(false);
    expect(passesReach(['invited'], { ...off, none: true })).toBe(false);
    expect(passesReach(['neighbor', 'invited'], { ...off, neighbor: true })).toBe(true);
  });

  it('has the toggles in order, all on in ALL_REACH', () => {
    expect(REACH_TOGGLES).toEqual(['neighbor', 'friend', 'guildMember', 'invited', 'none']);
    expect(Object.values(ALL_REACH)).toEqual([true, true, true, true, true]);
  });

  it('always lets an unknown player through', () => {
    expect(passesReach(['unknown'], off)).toBe(true);
  });
});
