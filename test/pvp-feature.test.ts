// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pvpFeature } from '../src/content/features/pvp/index';
import { KEEP_SETTING } from '../src/content/features/pvp/retention';
import { PAGE_SIZE } from '../src/content/features/pvp/view-model';
import type { BattlePersistence, BattleQuery } from '../src/content/stores/battles';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle } from '../src/shared/model';
import { featureContext } from './helpers/feature-context';

const battle = (battleId: number, opponent: number): Battle => ({
  world: worldId('de20'),
  battleId,
  at: Date.now(),
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
});

/** Persistence whose list calls stay open until the test resolves them. */
function controlled(total = 1) {
  const lists: { query: BattleQuery; resolve: (rows: Battle[]) => void }[] = [];
  const persistence: BattlePersistence = {
    put: async () => {},
    latest: async () => undefined,
    list: (_world, query) => new Promise((resolve) => lists.push({ query, resolve })),
    count: async () => state.total,
    prune: vi.fn(async () => 0),
  };
  const state = { total };
  return { persistence, lists, state };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(total = 1) {
  const stub = controlled(total);
  const env = featureContext(stub.persistence);
  pvpFeature.setup(env.ctx);
  env.menu('pvp');
  return { ...stub, ...env, box: env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>> };
}

afterEach(() => vi.useRealTimers());

describe('pvp feature', () => {
  it('shows only the newest query when an older one resolves last', async () => {
    const { ctx, box, lists } = setup();
    ctx.bus.emit('player.updated', { ids: [], source: 'update' });
    await tick();
    expect(lists).toHaveLength(2);
    const updatesBefore = box.updates.length;

    lists[1]?.resolve([battle(2, 222)]);
    await tick();
    lists[0]?.resolve([battle(1, 111)]);
    await tick();

    expect(box.text).toContain('222');
    expect(box.text).not.toContain('111');
    expect(box.updates.length - updatesBefore).toBe(1);
  });

  it('clamps the page when the total shrinks below it', async () => {
    const { ctx, box, lists, state } = setup(PAGE_SIZE * 3 - 5);
    await tick();
    lists[0]?.resolve([battle(1, 111)]);
    await tick();
    box.click('Weiter');
    await tick();
    lists[1]?.resolve([battle(2, 111)]);
    await tick();
    box.click('Weiter');
    await tick();
    expect(lists[2]?.query.offset).toBe(PAGE_SIZE * 2);
    lists[2]?.resolve([battle(3, 111)]);
    await tick();
    expect(box.text).toContain('Seite 3 von 3');

    state.total = 5;
    ctx.bus.emit('player.updated', { ids: [], source: 'update' });
    await tick();
    expect(lists[3]?.query.offset).toBe(0);
    lists[3]?.resolve([battle(4, 111)]);
    await tick();
    expect(box.text).toContain('111');
    expect(box.text).not.toContain('Seite');
  });

  it('prunes by the retention setting when it changes and when a session starts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0));
    const { ctx, persistence } = setup();
    const prune = vi.mocked(persistence.prune);
    const day = 86_400_000;

    await ctx.settings.set('other.setting', true);
    expect(prune).not.toHaveBeenCalled();

    await ctx.settings.set(KEEP_SETTING.key, '30');
    await tick();
    expect(prune).toHaveBeenLastCalledWith(Date.now() - 30 * day);

    prune.mockClear();
    vi.setSystemTime(new Date(2026, 9, 25, 12, 0));
    ctx.bus.emit('session.started', { session: {} as never });
    await tick();
    expect(prune).toHaveBeenCalledExactlyOnceWith(Date.now() - 30 * day);

    prune.mockClear();
    await ctx.settings.set(KEEP_SETTING.key, 'forever');
    ctx.bus.emit('session.started', { session: {} as never });
    await tick();
    expect(prune).not.toHaveBeenCalled();
  });

  it('reloads the list only when pruning deleted something', async () => {
    const { ctx, persistence, lists } = setup();
    await tick();
    const loads = lists.length;
    vi.mocked(persistence.prune).mockResolvedValueOnce(3);
    await ctx.settings.set(KEEP_SETTING.key, '30');
    await tick();
    expect(lists.length).toBe(loads + 1);
    await ctx.settings.set(KEEP_SETTING.key, '90');
    await tick();
    expect(lists.length).toBe(loads + 1);
  });
});
