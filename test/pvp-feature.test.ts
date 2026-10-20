// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pvpFeature } from '../src/content/features/pvp/index';
import { KEEP_SETTING } from '../src/content/features/pvp/retention';
import { PAGE_SIZE } from '../src/content/features/pvp/view-model';
import type { BattlePersistence, BattleQuery } from '../src/content/stores/battles';
import type { PlunderPersistence } from '../src/content/stores/plunders';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, Plunder } from '../src/shared/model';
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

const plunder = (opponent: number): Plunder => ({
  world: worldId('de20'),
  at: Date.now(),
  opponent: playerId(opponent),
  outcome: 'plundered',
  entityId: 350,
  cityEntityId: buildingDefId('R_IronAge_Residential2'),
  resources: { strategy_points: 12 },
  doubleLoot: true,
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
  const plunders: PlunderPersistence = {
    put: async () => {},
    latest: async () => undefined,
    list: vi.fn(async () => [plunder(333)]),
    totals: async () => ({ count: 1, repelled: 0, fp: 12 }),
    prune: vi.fn(async () => 0),
  };
  const state = { total };
  return { persistence, plunders, lists, state };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(total = 1) {
  const stub = controlled(total);
  const env = featureContext(stub.persistence, stub.plunders);
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

  it('switches to the plunder list and shows the plunder totals of the filter', async () => {
    const { box, lists, plunders } = setup();
    await tick();
    lists[0]?.resolve([battle(1, 111)]);
    await tick();
    expect(box.text).toContain('1 Plünderung, 12 FP');
    expect(box.text).toContain('111');
    expect(plunders.list).not.toHaveBeenCalled();

    box.click('Plünderungen');
    await tick();
    expect(plunders.list).toHaveBeenCalledWith(worldId('de20'), { limit: PAGE_SIZE, offset: 0 });
    expect(box.text).toContain('333');
    expect(box.text).toContain('12 Forge-Punkte Double Loot');
    expect(box.text).not.toContain('111');
    expect(lists).toHaveLength(1);
  });

  it('lists repelled plunders and pages over plunders and repelled ones together', async () => {
    const stub = controlled();
    const env = featureContext(stub.persistence);
    pvpFeature.setup(env.ctx);
    env.menu('pvp');
    const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
    const at = Date.now();
    env.ctx.plunders.record({ ...plunder(333), at: at - PAGE_SIZE - 1 });
    for (let i = 0; i < PAGE_SIZE; i++) {
      env.ctx.plunders.record({ ...plunder(444), at: at - i, outcome: 'repelled', resources: {}, doubleLoot: false });
    }
    box.click('Plünderungen');
    await vi.waitFor(() => expect(box.text).toContain('1 Plünderung, 20 abgewehrt, 12 FP'));
    expect(box.text).toContain('Seite 1 von 2');
    expect(box.text).toContain('abgewehrt');
    expect(box.text).not.toContain('333');
  });

  it('prunes plunders with the battle retention and reloads when that deleted something', async () => {
    const { ctx, plunders, lists } = setup();
    await tick();
    const loads = lists.length;
    vi.mocked(plunders.prune).mockResolvedValueOnce(2);
    await ctx.settings.set(KEEP_SETTING.key, '30');
    await tick();
    expect(plunders.prune).toHaveBeenCalledOnce();
    expect(lists.length).toBe(loads + 1);
  });
});
