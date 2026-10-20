// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { sabotageFeature } from '../src/content/features/sabotage/index';
import type { BattlePersistence } from '../src/content/stores/battles';
import type { VisitedCity } from '../src/content/stores/cities';
import { buildingDefId, eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { Battle, Plunder } from '../src/shared/model';
import { featureContext } from './helpers/feature-context';

const world = worldId('de20');
const city = (owner: number): VisitedCity => ({
  world,
  owner: playerId(owner),
  era: eraId('ColonialAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(),
  visit: { neighbor: true, friend: false, guildMember: false },
});

/** A battle whose measured defense shows as `defense` percent. */
const battle = (opponent: number, defense: number): Battle => ({
  world,
  battleId: opponent,
  at: Date.now(),
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: { defense_boost: defense }, units: [] },
});

const plunder = (opponent: number, at: number, change: Partial<Plunder> = {}): Plunder => ({
  world,
  at,
  opponent: playerId(opponent),
  entityId: 350,
  cityEntityId: buildingDefId('R_IronAge_Residential2'),
  resources: { strategy_points: 4 },
  doubleLoot: false,
  ...change,
});

function setup() {
  const latest = new Map<PlayerId, (battle: Battle) => void>();
  const persistence: BattlePersistence = {
    put: async () => {},
    latest: (_world, opponent) => new Promise((resolve) => latest.set(opponent, resolve)),
    list: async () => [],
    count: async () => 0,
    prune: async () => 0,
  };
  const env = featureContext(persistence);
  sabotageFeature.setup(env.ctx);
  const box = env.boxes.get('sabotage') as NonNullable<ReturnType<typeof env.boxes.get>>;
  return { ...env, box, latest };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('sabotage feature', () => {
  it.each([
    ['older lookup resolves last', [2, 1]],
    ['older lookup resolves first', [1, 2]],
  ])('after a fast city switch shows the last visited city only (%s)', async (_name, order) => {
    const { ctx, box, latest } = setup();
    ctx.cities.setVisited(city(1));
    ctx.cities.setVisited(city(2));
    await tick();
    const results: Record<number, Battle> = { 1: battle(1, 111), 2: battle(2, 222) };

    for (const owner of order) {
      latest.get(playerId(owner))?.(results[owner] as Battle);
      await tick();
    }

    expect(box.text).toContain('Gemessen');
    expect(box.text).toContain('222');
    expect(box.text).not.toContain('111');
  });

  it('shows the last battle when the city did not change meanwhile', async () => {
    const { ctx, box, latest } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.text).not.toContain('Gemessen');
    latest.get(playerId(1))?.(battle(1, 111));
    await tick();
    expect(box.text).toContain('111');
  });

  it('shows the last plunder and the totals of the visited player, and follows new plunders', async () => {
    const { ctx, box } = setup();
    ctx.plunders.record(plunder(1, Date.now() - 1000));
    ctx.plunders.record(plunder(2, Date.now()));
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('1 Plünderung, 4 FP'));
    expect(box.text).toContain('R_IronAge_Residential2: 4 Forge-Punkte');
    expect(box.text).not.toContain('Double Loot');

    ctx.plunders.record(plunder(1, Date.now() + 1000, { doubleLoot: true, resources: { money: 20 } }));
    await vi.waitFor(() => expect(box.text).toContain('2 Plünderungen, 4 FP'));
    expect(box.text).toMatch(/20 Münzen\s+Double Loot/);
  });

  it('tells when the visited player was never plundered', async () => {
    const { ctx, box } = setup();
    ctx.plunders.record(plunder(2, Date.now()));
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('Hier hast du noch nicht geplündert.'));
  });
});
