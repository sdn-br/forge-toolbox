import { describe, expect, it, vi } from 'vitest';
import { type FetchLike, foestatsApi, parsePlayer } from '../src/shared/foestats-api';
import { playerId, worldId } from '../src/shared/ids';

describe('parsePlayer', () => {
  it('reads numbers and numeric strings', () => {
    expect(
      parsePlayer({
        success: true,
        data: {
          rank: '12',
          points: 1234567,
          points_change: '-50',
          points_change_percent: '0.5',
          battles: '800',
          battles_change: 3,
          era: 'SpaceAgeMars',
          guild_name: 'Gilde',
          guild_id: '77',
          is_active: 1,
          data_date: '2026-10-22',
        },
      }),
    ).toEqual({
      rank: 12,
      points: 1234567,
      pointsChange: -50,
      battles: 800,
      battlesChange: 3,
      era: 'SpaceAgeMars',
      guild: { id: 77, name: 'Gilde' },
      active: true,
      date: '2026-10-22',
    });
  });

  it('leaves out what is missing or not a number', () => {
    expect(parsePlayer({ success: true, data: { points: 'viel', battles: null, guild_name: 'G' } })).toEqual({});
  });

  it('gives nothing for a failed or broken answer', () => {
    expect(parsePlayer({ success: false, data: { points: 1 } })).toBeUndefined();
    expect(parsePlayer({ success: true })).toBeUndefined();
    expect(parsePlayer('<html>')).toBeUndefined();
    expect(parsePlayer(null)).toBeUndefined();
  });
});

const response = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

describe('foestats api', () => {
  const world = worldId('de20');
  const player = playerId(4711);

  it('asks the snapshot of a player without cookies', async () => {
    const fetch = vi.fn<FetchLike>(async () => response(200, JSON.stringify({ success: true, data: { points: 5 } })));
    expect(await foestatsApi(fetch).player(world, player)).toEqual({ snapshot: { points: 5 } });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.forge-db.com/api/players/de/de20/4711');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit' });
  });

  it('tells a player foestats does not know', async () => {
    const missing = foestatsApi(async () => response(404, JSON.stringify({ error: 'Player not found' })));
    expect(await missing.player(world, player)).toBe('unknown');
  });

  it('tells foestats unreachable instead of failing', async () => {
    const blocked = foestatsApi(async () => response(403, '<html>Cloudflare</html>'));
    expect(await blocked.player(world, player)).toBe('unreachable');
    const sessionRequired = foestatsApi(async () =>
      response(403, JSON.stringify({ error: 'Session required', sessionRequired: true, reason: 'missing' })),
    );
    expect(await sessionRequired.player(world, player)).toBe('unreachable');
    const down = foestatsApi(async () => response(503, ''));
    expect(await down.player(world, player)).toBe('unreachable');
    const html = foestatsApi(async () => response(200, '<html>'));
    expect(await html.player(world, player)).toBe('unreachable');
    const offline = foestatsApi(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await offline.player(world, player)).toBe('unreachable');
  });
});
