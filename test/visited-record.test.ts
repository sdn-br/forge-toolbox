import { describe, expect, it } from 'vitest';
import { visitedRecord } from '../src/content/features/sabotage/visited-record';
import type { VisitedCity } from '../src/content/stores/cities';
import { type ShieldPersistence, ShieldStore } from '../src/content/stores/shields';
import { eraId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { CityShield } from '../src/shared/model';
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
const UNTIL = Date.now() + 3_600_000;
const shield = (player: number): CityShield => ({ world, player: playerId(player), expiresAt: UNTIL });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** a record whose shield lookups stay open until the test answers them */
function setup() {
  const answers = new Map<PlayerId, (shield: CityShield | undefined) => void>();
  const persistence: ShieldPersistence = {
    put: async () => {},
    get: (_world, player) => new Promise((resolve) => answers.set(player, resolve)),
    prune: async () => 0,
  };
  const { ctx } = featureContext({
    overrides: ({ bus, world }) => ({ shields: new ShieldStore(bus, world, persistence) }),
  });
  let changes = 0;
  const record = visitedRecord(ctx, () => changes++);
  return { ctx, record, answers, changes: () => changes };
}

describe('record of the visited player', () => {
  it('drops a response that comes in after the next visit, and never shows it for the next player', async () => {
    const { ctx, record, answers, changes } = setup();
    ctx.cities.setVisited(city(1));
    ctx.cities.setVisited(city(2));
    await tick();

    answers.get(playerId(1))?.(shield(1));
    await tick();
    expect(changes()).toBe(0);
    expect(record.current(playerId(1)).shield).toBeUndefined();
    expect(record.current(playerId(2)).shield).toBeUndefined();

    answers.get(playerId(2))?.(shield(2));
    await tick();
    expect(changes()).toBe(1);
    expect(record.current(playerId(2)).shield).toEqual(shield(2));
  });

  it('keeps the part of a player to that player once the next one is visited', async () => {
    const { ctx, record, answers } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    answers.get(playerId(1))?.(shield(1));
    await tick();
    expect(record.current(playerId(1)).shield).toEqual(shield(1));

    ctx.cities.setVisited(city(2));
    expect(record.current(playerId(2)).shield).toBeUndefined();
  });
});
