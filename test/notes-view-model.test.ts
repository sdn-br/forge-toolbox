import { describe, expect, it } from 'vitest';
import { ALL_REACH } from '../src/content/domain/reach';
import { matchesRelation, snippet } from '../src/content/features/notes/view-model';

describe('notes view model', () => {
  it('cuts a snippet around the first match', () => {
    const text = `${'a'.repeat(50)} target ${'b'.repeat(200)}`;
    const cut = snippet(text, 'target');
    expect(cut.startsWith('…')).toBe(true);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).toContain('target');
    expect(snippet('short\n\ntext', '')).toBe('short text');
  });

  it('counts players without a known relation as none, also unknown ones', () => {
    const off = { neighbor: false, friend: false, guildMember: false, none: false };
    const none = { neighbor: false, guildMember: false, friend: false };
    expect(matchesRelation({ ...off, none: true }, undefined)).toBe(true);
    expect(matchesRelation({ ...off, none: true }, none)).toBe(true);
    expect(matchesRelation({ ...off, none: true }, { ...none, friend: true })).toBe(false);
    expect(matchesRelation({ ...off, friend: true }, { ...none, friend: true })).toBe(true);
    expect(matchesRelation({ ...off, neighbor: true }, undefined)).toBe(false);
  });

  it('lets a player through when any of their relations is switched on', () => {
    const off = { neighbor: false, friend: false, guildMember: false, none: false };
    const both = { neighbor: true, guildMember: true, friend: false };
    expect(matchesRelation({ ...off, guildMember: true }, both)).toBe(true);
    expect(matchesRelation({ ...off, friend: true, none: true }, both)).toBe(false);
    expect(matchesRelation(ALL_REACH, undefined)).toBe(true);
  });
});
