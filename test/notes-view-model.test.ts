import { describe, expect, it } from 'vitest';
import { avatarUrl, matchesRelation, snippet } from '../src/content/features/notes/view-model';
import { worldId } from '../src/shared/ids';

describe('notes view model', () => {
  it('cuts a snippet around the first match', () => {
    const text = `${'a'.repeat(50)} target ${'b'.repeat(200)}`;
    const cut = snippet(text, 'target');
    expect(cut.startsWith('…')).toBe(true);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).toContain('target');
    expect(snippet('short\n\ntext', '')).toBe('short text');
  });

  it('counts players without a known relation as other', () => {
    const none = { neighbor: false, guildMember: false, friend: false };
    expect(matchesRelation('other', undefined)).toBe(true);
    expect(matchesRelation('other', none)).toBe(true);
    expect(matchesRelation('other', { ...none, friend: true })).toBe(false);
    expect(matchesRelation('friend', { ...none, friend: true })).toBe(true);
    expect(matchesRelation('neighbor', undefined)).toBe(false);
  });

  it('builds the avatar URL on the CDN of the world language and refuses odd ids', () => {
    expect(avatarUrl(worldId('de20'), 'portrait_433')).toBe(
      'https://foede.innogamescdn.com/assets/shared/avatars/portrait_433.jpg',
    );
    expect(avatarUrl(worldId('de20'), '../x')).toBeUndefined();
  });
});
