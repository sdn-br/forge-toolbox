import { describe, expect, it } from 'vitest';
import { GreatBuildingStore } from '../src/content/stores/great-buildings';
import type { GreatBuildingListRow } from '../src/persistence/great-buildings/contract';
import { type BuildingDefId, playerId, worldId } from '../src/shared/ids';
import type { KnownGreatBuilding } from '../src/shared/model';
import { testStores } from './helpers/stores';

const DAY = 24 * 60 * 60 * 1000;
const owner = playerId(1001);
const w = worldId('de20');

const listRow = (entityId: number, over: Partial<GreatBuildingListRow> = {}): GreatBuildingListRow => ({
  owner,
  entityId,
  cityEntityId: 'X' as BuildingDefId,
  level: 5,
  invested: 100,
  required: 500,
  ...over,
});

const opened = (entityId: number, over: Partial<KnownGreatBuilding> = {}): KnownGreatBuilding => ({
  world: w,
  owner,
  entityId,
  cityEntityId: 'X' as BuildingDefId,
  level: 5,
  invested: 100,
  required: 500,
  rankings: [],
  rankingsLevel: 5,
  seenAt: 1_000,
  ...over,
});

function setup() {
  let clock = 1_000;
  const env = testStores({ now: () => clock });
  const { greatBuildings } = env.stores;
  return {
    ...env,
    greatBuildings,
    at: (t: number) => {
      clock = t;
    },
    row: async (entityId: number) => (await greatBuildings.known()).find((b) => b.entityId === entityId),
  };
}

describe('ignoring great buildings', () => {
  it('ignores a known building and releases it again, telling the bus', async () => {
    const { greatBuildings, bus, row } = setup();
    greatBuildings.noteList([listRow(1)]);
    const events: unknown[] = [];
    bus.on('greatBuilding.ignored', (e) => events.push(e));
    expect(greatBuildings.isIgnored(owner, 1)).toBe(false);
    await greatBuildings.ignore(owner, 1, true);
    expect(greatBuildings.isIgnored(owner, 1)).toBe(true);
    expect((await row(1))?.ignored).toBe(true);
    await greatBuildings.ignore(owner, 1, false);
    expect(greatBuildings.isIgnored(owner, 1)).toBe(false);
    expect((await row(1))?.ignored).toBeUndefined();
    expect(events).toEqual([
      { owner, entityId: 1, ignored: true },
      { owner, entityId: 1, ignored: false },
    ]);
  });

  it('is independent of the star', async () => {
    const { greatBuildings, row } = setup();
    greatBuildings.noteList([listRow(1)]);
    await greatBuildings.mark(owner, 1, true);
    await greatBuildings.ignore(owner, 1, true);
    await greatBuildings.mark(owner, 1, false);
    expect(greatBuildings.isIgnored(owner, 1)).toBe(true);
    expect(await row(1)).toMatchObject({ ignored: true });
    expect((await row(1))?.marked).toBeUndefined();
  });

  it('ignores a building whose row is still being written', async () => {
    const { greatBuildings } = setup();
    greatBuildings.noteList([listRow(1)]);
    await greatBuildings.ignore(owner, 1, true);
    expect(greatBuildings.isIgnored(owner, 1)).toBe(true);
  });

  it('does not ignore a building that is not stored', async () => {
    const { greatBuildings, bus } = setup();
    const events: unknown[] = [];
    bus.on('greatBuilding.ignored', (e) => events.push(e));
    await greatBuildings.ignore(owner, 99, true);
    expect(greatBuildings.isIgnored(owner, 99)).toBe(false);
    expect(events).toEqual([]);
  });

  it('knows its ignores again after a reload', async () => {
    const { greatBuildings, db, world, bus } = setup();
    greatBuildings.noteList([listRow(1), listRow(2)]);
    await greatBuildings.ignore(owner, 2, true);
    const reloaded = new GreatBuildingStore(bus, world, db.greatBuildings);
    expect(reloaded.isIgnored(owner, 2)).toBe(false);
    await reloaded.load();
    expect(reloaded.isIgnored(owner, 2)).toBe(true);
    expect(reloaded.isIgnored(owner, 1)).toBe(false);
    expect(reloaded.isMarked(owner, 2)).toBe(false);
  });
});

describe('the ignore survives every write path', () => {
  it('a newer list', async () => {
    const { greatBuildings, at, row } = setup();
    greatBuildings.noteList([listRow(1)]);
    await greatBuildings.ignore(owner, 1, true);
    at(2_000);
    greatBuildings.noteList([listRow(1, { invested: 300 })]);
    expect(await row(1)).toMatchObject({ invested: 300, ignored: true });
  });

  it('a list with a new level', async () => {
    const { greatBuildings, at, row } = setup();
    greatBuildings.noteList([listRow(1)]);
    await greatBuildings.ignore(owner, 1, true);
    at(2_000);
    greatBuildings.noteList([listRow(1, { level: 6, invested: 0 })]);
    expect(await row(1)).toMatchObject({ level: 6, ignored: true });
  });

  it('an older list', async () => {
    const { greatBuildings, at, row } = setup();
    at(5_000);
    greatBuildings.noteList([listRow(1)]);
    await greatBuildings.ignore(owner, 1, true);
    at(2_000);
    greatBuildings.noteList([listRow(1, { rank: 2, forgePoints: 10, reward: 5 })]);
    expect(await row(1)).toMatchObject({ ownContribution: true, ignored: true });
  });

  it('an opened building', async () => {
    const { greatBuildings, db, row } = setup();
    greatBuildings.noteList([listRow(1)]);
    await greatBuildings.ignore(owner, 1, true);
    await db.greatBuildings.put([opened(1, { seenAt: 3_000, invested: 250 })]);
    expect(await row(1)).toMatchObject({ invested: 250, rankingsLevel: 5, ignored: true });
  });

  it('the town hall list', async () => {
    const { greatBuildings, at, row } = setup();
    greatBuildings.noteList([listRow(1)]);
    await greatBuildings.ignore(owner, 1, true);
    at(2_000);
    greatBuildings.noteContributions([listRow(1, { rank: 3, forgePoints: 40, reward: 20 })]);
    expect(await row(1)).toMatchObject({ ownContribution: true, ignored: true });
  });

  it('a town hall list that no longer names the building keeps it as a plain, ignored building', async () => {
    const { greatBuildings, at, row } = setup();
    at(1_000);
    greatBuildings.noteContributions([
      listRow(1, { rank: 3, forgePoints: 40, reward: 20 }),
      listRow(2, { rank: 1, forgePoints: 40, reward: 20 }),
    ]);
    await greatBuildings.ignore(owner, 1, true);
    at(2_000);
    greatBuildings.noteContributions([listRow(2, { rank: 1, forgePoints: 40, reward: 20 })]);
    const kept = await row(1);
    expect(kept).toMatchObject({ ignored: true });
    expect(kept?.ownContribution).toBeUndefined();
    expect(kept?.contribution).toBeUndefined();
    expect(await row(2)).toMatchObject({ ownContribution: true });
  });

  it('a gone building without an ignore is still deleted', async () => {
    const { greatBuildings, at, row } = setup();
    greatBuildings.noteContributions([listRow(1, { rank: 3, forgePoints: 40, reward: 20 })]);
    at(2_000);
    greatBuildings.noteContributions([]);
    expect(await row(1)).toBeUndefined();
  });
});

describe('retention of ignored buildings', () => {
  it('prunes by the given days but never an ignored building', async () => {
    const { greatBuildings, at, row } = setup();
    greatBuildings.noteList([listRow(1), listRow(2)]);
    await greatBuildings.ignore(owner, 1, true);
    at(1_000 + 31 * DAY);
    await greatBuildings.prune(30);
    expect(await row(1)).toBeDefined();
    expect(await row(2)).toBeUndefined();
  });

  it('prunes a building again once it is released', async () => {
    const { greatBuildings, at, row } = setup();
    greatBuildings.noteList([listRow(1)]);
    await greatBuildings.ignore(owner, 1, true);
    await greatBuildings.ignore(owner, 1, false);
    at(1_000 + 31 * DAY);
    await greatBuildings.prune(30);
    expect(await row(1)).toBeUndefined();
  });
});
