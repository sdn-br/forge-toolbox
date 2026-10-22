import { describe, expect, it } from 'vitest';
import { foestatsGuildUrl, foestatsPlayerUrl, foestatsWorld } from '../src/shared/foestats';
import { guildId, playerId, worldId } from '../src/shared/ids';

describe('foestats links', () => {
  it('splits the game world into the server prefix and the world', () => {
    expect(foestatsWorld(worldId('de20'))).toEqual({ server: 'de', world: 'de20' });
    expect(foestatsWorld(worldId('zz1'))).toEqual({ server: 'zz', world: 'zz1' });
  });

  it('links a player and a guild of the world', () => {
    expect(foestatsPlayerUrl(worldId('de20'), playerId(12345))).toBe('https://foestats.com/de/de20/players/12345');
    expect(foestatsGuildUrl(worldId('en7'), guildId(77))).toBe('https://foestats.com/en/en7/guilds/77');
  });
});
