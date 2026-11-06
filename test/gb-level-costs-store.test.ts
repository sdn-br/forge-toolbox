import { describe, expect, it } from 'vitest';
import { createBus } from '../src/content/core/events';
import type { GreatBuildingDef } from '../src/content/model/catalog';
import { GbLevelCostStore } from '../src/content/stores/gb-level-costs';
import { gbLevelCostPersistence } from '../src/persistence/gb-level-costs/client';
import { buildingDefId } from '../src/shared/ids';
import { testDb } from './helpers/battle-db';

const arche = buildingDefId('X_FutureEra_Landmark1');
const zeus = buildingDefId('X_BronzeAge_Landmark1');
const listed = (base: number) => Array.from({ length: 10 }, (_, i) => base * (i + 1));
const archeDef: GreatBuildingDef = { era: 'FutureEra', levelCosts: listed(84) };

function setup(at = 1000) {
  const db = testDb();
  const persistence = gbLevelCostPersistence(db.call);
  const bus = createBus();
  const changed: string[][] = [];
  bus.on('gbLevelCosts.changed', ({ types }) => changed.push(types));
  const store = new GbLevelCostStore(bus, persistence, () => at);
  return { db, persistence, bus, store, changed };
}

describe('GbLevelCostStore', () => {
  it('answers a seen cost as exact, a listed one too, and nothing it cannot derive', () => {
    const { store } = setup();
    store.note([{ type: arche, level: 137, fp: 62495 }]);
    expect(store.cost(archeDef, arche, 137)).toEqual({ fp: 62495, estimate: false });
    expect(store.cost(archeDef, arche, 9)).toEqual({ fp: 840, estimate: false });
    expect(store.cost(archeDef, arche, 50)).toBeUndefined();
  });

  it('estimates the gaps from the learned steps', () => {
    const { store } = setup();
    store.note([
      { type: arche, level: 15, fp: 1080 },
      { type: arche, level: 50, fp: 2755 },
      { type: arche, level: 80, fp: 5706 },
      { type: arche, level: 120, fp: 37964 },
    ]);
    expect(store.cost(archeDef, arche, 137)).toEqual({ fp: 62495, estimate: true });
    expect(store.costs(archeDef, arche)(10)).toEqual({ fp: 880, estimate: true });
  });

  it('keeps the costs of each type apart', () => {
    const { store } = setup();
    store.note([{ type: zeus, level: 137, fp: 5 }]);
    expect(store.cost(archeDef, arche, 137)).toBeUndefined();
  });

  it('replaces a cost with a newer different one and announces only what changed', async () => {
    const { store, persistence, changed } = setup();
    store.note([{ type: arche, level: 137, fp: 60000 }]);
    store.note([{ type: arche, level: 137, fp: 60000 }]);
    store.note([
      { type: arche, level: 137, fp: 62495 },
      { type: zeus, level: 88, fp: 3667 },
    ]);
    expect(store.cost(archeDef, arche, 137)?.fp).toBe(62495);
    expect(changed).toEqual([[arche], [arche, zeus]]);
    await store.flushed();
    expect((await persistence.all()).map((r) => [r.type, r.level, r.fp, r.at])).toEqual([
      [zeus, 88, 3667, 1000],
      [arche, 137, 62495, 1000],
    ]);
  });

  it('skips costs that are no positive integer', () => {
    const { store, changed } = setup();
    store.note([
      { type: arche, level: 20, fp: 0 },
      { type: arche, level: -1, fp: 5 },
      { type: arche, level: 21, fp: 1.5 },
    ]);
    expect(changed).toEqual([]);
  });

  it('reads what was seen before a reload, a cost seen meanwhile stays', async () => {
    const first = setup();
    first.store.note([
      { type: arche, level: 137, fp: 62495 },
      { type: arche, level: 120, fp: 1 },
    ]);
    await first.store.flushed();
    const bus = createBus();
    const changed: string[][] = [];
    bus.on('gbLevelCosts.changed', ({ types }) => changed.push(types));
    const store = new GbLevelCostStore(bus, first.persistence);
    store.note([{ type: arche, level: 120, fp: 37964 }]);
    await store.load();
    expect(store.cost(archeDef, arche, 137)?.fp).toBe(62495);
    expect(store.cost(archeDef, arche, 120)?.fp).toBe(37964);
    expect(changed).toEqual([[arche], [arche]]);
  });
});
