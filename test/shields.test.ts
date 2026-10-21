import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { ShieldStore } from '../src/content/stores/shields';
import { type PlayerId, playerId, worldId } from '../src/shared/ids';
import { testStores } from './helpers/stores';

const world = worldId('de20');
// Unix seconds, as the game sends them
const NOW_S = 1_792_000_000;
const HOUR_S = 3600;

function setup() {
  const ingestion = new Ingestion();
  let now = NOW_S * 1000;
  const clock = () => now;
  const { db, bus, stores } = testStores({ now: clock });
  registerGameHandlers(ingestion, { world, bus, now: clock, ...stores });
  const { shields } = stores;
  const recorded: PlayerId[][] = [];
  bus.on('shield.recorded', (e) => recorded.push(e.players));
  const entries = (responseData: unknown) =>
    JSON.stringify([{ requestClass: 'OtherPlayerService', requestMethod: 'getCityProtections', responseData }]);
  return {
    db,
    shields,
    recorded,
    clock,
    setNow: (ms: number) => (now = ms),
    json: (data: unknown) =>
      ingestion.accept({ kind: 'json', url: '/game/json?h=1', request: null, response: entries(data), at: 0 }),
    ws: (data: unknown) => ingestion.accept({ kind: 'ws', data: entries(data), at: 0 }),
  };
}

const until = (player: number, shields: ShieldStore) => shields.active(playerId(player)).then((s) => s?.expiresAt);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('city shields', () => {
  it.each(['json', 'ws'] as const)('records a shield from getCityProtections over %s', async (via) => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = setup();
    env[via]([{ playerId: 1, expireTime: NOW_S + 24 * HOUR_S }]);
    expect(await until(1, env.shields)).toBe((NOW_S + 24 * HOUR_S) * 1000);
    expect(env.recorded).toEqual([[playerId(1)]]);
  });

  it('logs the raw payload once per message', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = setup();
    const payload = [{ playerId: 1, expireTime: NOW_S + HOUR_S }];
    env.ws(payload);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]).toEqual(['[Forge Toolbox]', 'getCityProtections (format unconfirmed)', 'ws', payload]);
  });

  it('ignores players that cannot be attacked at all (-1) and malformed entries', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = setup();
    env.json([
      { playerId: 1, expireTime: -1 },
      { playerId: '2', expireTime: NOW_S + HOUR_S },
      { playerId: 3 },
      { playerId: 4, expireTime: 'soon' },
      null,
      7,
      { playerId: 5, expireTime: NOW_S + HOUR_S },
    ]);
    env.json({ not: 'a list' });
    for (const id of [1, 2, 3, 4]) expect(await until(id, env.shields)).toBeUndefined();
    expect(await until(5, env.shields)).toBe((NOW_S + HOUR_S) * 1000);
    expect(env.recorded).toEqual([[playerId(5)]]);
  });

  it('replaces the shield of a player with a new message and keeps the others', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = setup();
    env.json([
      { playerId: 1, expireTime: NOW_S + HOUR_S },
      { playerId: 2, expireTime: NOW_S + HOUR_S },
    ]);
    env.ws([{ playerId: 1, expireTime: NOW_S + 72 * HOUR_S }]);
    expect(await until(1, env.shields)).toBe((NOW_S + 72 * HOUR_S) * 1000);
    expect(await until(2, env.shields)).toBe((NOW_S + HOUR_S) * 1000);
  });

  it('does not show an expired shield and prunes it', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = setup();
    env.json([
      { playerId: 1, expireTime: NOW_S + HOUR_S },
      { playerId: 2, expireTime: NOW_S + 3 * HOUR_S },
    ]);
    env.setNow((NOW_S + 2 * HOUR_S) * 1000);
    expect(await until(1, env.shields)).toBeUndefined();
    expect(await env.shields.prune()).toBe(1);
    expect((await env.db.db.cityShields.toArray()).map((s) => s.player)).toEqual([2]);
  });

  it('keeps a shield over a reload', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = setup();
    env.json([{ playerId: 1, expireTime: NOW_S + HOUR_S }]);
    await until(1, env.shields);
    const later = new ShieldStore(createBus(), world, env.db.shields, env.clock);
    expect(await until(1, later)).toBe((NOW_S + HOUR_S) * 1000);
    const otherWorld = new ShieldStore(createBus(), worldId('en1'), env.db.shields, env.clock);
    expect(await until(1, otherWorld)).toBeUndefined();
  });
});
