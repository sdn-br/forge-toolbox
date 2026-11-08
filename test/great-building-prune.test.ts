import { describe, expect, it } from 'vitest';
import { playerId, worldId } from '../src/shared/ids';
import type { KnownGreatBuilding } from '../src/shared/model';
import { testDb } from './helpers/battle-db';

const world = worldId('de20');

describe('pruning great buildings', () => {
  const row = (entityId: number, seenAt: number, over: Partial<KnownGreatBuilding> = {}): KnownGreatBuilding => ({
    world,
    owner: playerId(1001),
    entityId,
    cityEntityId: 'X' as KnownGreatBuilding['cityEntityId'],
    level: 5,
    invested: 100,
    required: 500,
    seenAt,
    ...over,
  });

  it('returns how many buildings it deleted, never the kept ones', async () => {
    const { db, greatBuildings } = testDb();
    await db.greatBuildings.bulkPut([row(1, 100), row(2, 100), row(3, 100, { marked: true }), row(4, 900)]);
    expect(await greatBuildings.prune(world, 500)).toBe(2);
    expect((await db.greatBuildings.toArray()).map((b) => b.entityId).sort()).toEqual([3, 4]);
    expect(await greatBuildings.prune(world, 500)).toBe(0);
  });
});
