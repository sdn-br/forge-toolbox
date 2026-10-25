import type { Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { GreatBuildingListRow, GreatBuildingsApi } from './contract';
import { applyListRow, hasOwnContribution, isFlagged, withoutOwnContribution } from './merge';

/** when the town hall list of the own contributions last came in a world */
export interface GreatBuildingListTimes {
  world: WorldId;
  contributionsAt: number;
}

export type GreatBuildingsTables = {
  greatBuildings: Table<KnownGreatBuilding, [WorldId, PlayerId, number]>;
  greatBuildingLists: Table<GreatBuildingListTimes, WorldId>;
};

export function greatBuildingsHandlers(db: GreatBuildingsTables): Handlers<GreatBuildingsApi> {
  const writeList = async (world: WorldId, rows: GreatBuildingListRow[], at: number, own: boolean) => {
    const known = await db.greatBuildings.bulkGet(rows.map((r) => [world, r.owner, r.entityId]));
    const changed = rows.flatMap((row, i) => {
      const next = applyListRow(world, known[i], row, at, own);
      return next ? [next] : [];
    });
    await db.greatBuildings.bulkPut(changed);
  };
  return {
    'greatBuildings.put': async ({ rows }) => {
      const known = await db.greatBuildings.bulkGet(rows.map((r) => [r.world, r.owner, r.entityId]));
      await db.greatBuildings.bulkPut(
        rows.map((row, i) => ({
          ...row,
          ...(known[i]?.ownContribution && { ownContribution: true }),
          ...(known[i]?.marked && { marked: true }),
          ...(known[i]?.ignored && { ignored: true }),
        })),
      );
    },
    'greatBuildings.putList': async ({ world, rows, at }) => {
      await writeList(world, rows, at, false);
    },
    'greatBuildings.putContributions': async ({ world, rows, at }) => {
      await writeList(world, rows, at, true);
      const listed = new Set(rows.map((r) => `${r.owner}:${r.entityId}`));
      const gone = (await db.greatBuildings.where('world').equals(world).toArray()).filter(
        (b) => b.ownContribution && !listed.has(`${b.owner}:${b.entityId}`),
      );
      await db.greatBuildings.bulkDelete(
        gone.filter((b) => !isFlagged(b)).map((b): [WorldId, PlayerId, number] => [b.world, b.owner, b.entityId]),
      );
      await db.greatBuildings.bulkPut(gone.filter(isFlagged).map(withoutOwnContribution));
      await db.greatBuildingLists.put({ world, contributionsAt: at });
    },
    'greatBuildings.contributionsAt': async ({ world }) => (await db.greatBuildingLists.get(world))?.contributionsAt,
    'greatBuildings.prune': async ({ world, before }) => {
      const stale = (await db.greatBuildings.where('seenAt').below(before).toArray())
        .filter((b) => b.world === world && !hasOwnContribution(b) && !isFlagged(b))
        .map((b): [WorldId, PlayerId, number] => [b.world, b.owner, b.entityId]);
      await db.greatBuildings.bulkDelete(stale);
    },
    'greatBuildings.setFlag': async ({ world, owner, entityId, flag, value }) => {
      const row = await db.greatBuildings.get([world, owner, entityId]);
      if (!row) return false;
      const { [flag]: _, ...rest } = row;
      await db.greatBuildings.put(value ? { ...rest, [flag]: true } : rest);
      return true;
    },
    'greatBuildings.flagged': async ({ world, flag }) =>
      (await db.greatBuildings.where('world').equals(world).toArray())
        .filter((b) => b[flag])
        .map((b) => ({ owner: b.owner, entityId: b.entityId })),
    'greatBuildings.list': ({ world, owner }) =>
      owner === undefined
        ? db.greatBuildings.where('world').equals(world).toArray()
        : db.greatBuildings.where('[world+owner]').equals([world, owner]).toArray(),
  };
}
