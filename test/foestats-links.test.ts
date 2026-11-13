import { describe, expect, it } from 'vitest';
import { sourceGuildUrl, sourcePlayerUrl } from '../src/shared/activity-source';
import { foestatsGuildUrl, foestatsPlayerUrl, foestatsWorld } from '../src/shared/foestats';
import { guildId, playerId, worldId } from '../src/shared/ids';
import { scoredbWorld } from '../src/shared/scoredb';

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

describe('links by the chosen site', () => {
  const world = worldId('de10');

  it('links ScoreDB with the world upper-cased', () => {
    expect(scoredbWorld(world)).toBe('DE10');
    expect(sourcePlayerUrl('scoredb', world, playerId(42))).toBe('https://foe.scoredb.io/DE10/Player/42');
    expect(sourceGuildUrl('scoredb', world, guildId(507))).toBe('https://foe.scoredb.io/DE10/Guild/507');
  });

  it('links foestats when it is chosen or no site is asked', () => {
    for (const source of ['foestats', 'none'] as const) {
      expect(sourcePlayerUrl(source, world, playerId(42))).toBe('https://foestats.com/de/de10/players/42');
      expect(sourceGuildUrl(source, world, guildId(507))).toBe('https://foestats.com/de/de10/guilds/507');
    }
  });
});
