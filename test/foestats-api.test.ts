import { describe, expect, it, vi } from 'vitest';
import { type FetchLike, foestatsApi, parseHistory, parsePlayer } from '../src/persistence/foestats/api';
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

describe('parseHistory', () => {
  it('reads one value per day and skips broken entries', () => {
    expect(
      parseHistory({
        success: true,
        data: [
          { date: '2025-12-01', value: '100' },
          { date: '2025-12-02T00:00:00.000Z', value: 120 },
          { date: 'gestern', value: 5 },
          { date: '2025-12-03', value: 'x' },
          { value: 7 },
        ],
      }),
    ).toEqual([
      { date: '2025-12-01', value: 100 },
      { date: '2025-12-02', value: 120 },
    ]);
  });

  it('gives nothing for a failed or broken answer', () => {
    expect(parseHistory({ success: false, data: [] })).toBeUndefined();
    expect(parseHistory({ success: true, data: {} })).toBeUndefined();
    expect(parseHistory(undefined)).toBeUndefined();
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

  it('asks the history of a player without cookies', async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      response(200, JSON.stringify({ success: true, data: [{ date: '2026-10-21', value: 9 }] })),
    );
    const api = foestatsApi(fetch);
    expect(await api.pointsHistory(world, player)).toEqual([{ date: '2026-10-21', value: 9 }]);
    expect(await api.battlesHistory(world, player)).toEqual([{ date: '2026-10-21', value: 9 }]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.forge-db.com/api/players/de/de20/4711/points-history',
      'https://api.forge-db.com/api/players/de/de20/4711/battles-history',
    ]);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit' });
  });

  it('asks the snapshot of a player', async () => {
    const fetch = vi.fn<FetchLike>(async () => response(200, JSON.stringify({ success: true, data: { points: 5 } })));
    expect(await foestatsApi(fetch).player(world, player)).toEqual({ points: 5 });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.forge-db.com/api/players/de/de20/4711');
  });

  it('gives nothing instead of failing when foestats cannot be reached', async () => {
    const blocked = foestatsApi(async () => response(403, '<html>Cloudflare</html>'));
    expect(await blocked.pointsHistory(world, player)).toBeUndefined();
    const html = foestatsApi(async () => response(200, '<html>'));
    expect(await html.battlesHistory(world, player)).toBeUndefined();
    const offline = foestatsApi(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await offline.player(world, player)).toBeUndefined();
  });
});
