import type Dexie from 'dexie';
import type { Table } from 'dexie';
import {
  applyListRow,
  gbKey,
  gbStringKey,
  growthSince,
  hasOwnContribution,
  isFlagged,
  kept,
  withoutOwnContribution,
} from '../../shared/great-buildings';
import type { PlayerId, WorldId } from '../../shared/ids';
import { type GreatBuildingListRow, type KnownGreatBuilding, type MarkKind, OTHER_MARK } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { GreatBuildingsApi } from './contract';

/** when the town hall list of the own contributions last came in a world */
export interface GreatBuildingListTimes {
  world: WorldId;
  contributionsAt: number;
}

export type GreatBuildingsTables = {
  greatBuildings: Table<KnownGreatBuilding, [WorldId, PlayerId, number]>;
  greatBuildingLists: Table<GreatBuildingListTimes, WorldId>;
};

export function greatBuildingsHandlers(db: GreatBuildingsTables & Dexie): Handlers<GreatBuildingsApi> {
  const writeList = async (world: WorldId, rows: GreatBuildingListRow[], at: number, own: boolean) => {
    const known = await db.greatBuildings.bulkGet(rows.map((r) => gbKey({ world, ...r })));
    const changed = rows.flatMap((row, i) => {
      const next = applyListRow(world, known[i], row, at, own);
      return next ? [next] : [];
    });
    await db.greatBuildings.bulkPut(changed);
  };
  return {
    'greatBuildings.put': async ({ rows }) => {
      const known = await db.greatBuildings.bulkGet(rows.map(gbKey));
      // a batch may hold several writes of one building: each one is measured against the one before it
      const latest = new Map<string, KnownGreatBuilding>();
      const written = rows.map((row, i) => {
        const k = gbStringKey(row);
        const before = latest.get(k) ?? known[i];
        const next: KnownGreatBuilding = {
          ...row,
          ...growthSince(before, row, row.seenAt),
          ...kept(before),
        };
        latest.set(k, next);
        return next;
      });
      await db.greatBuildings.bulkPut(written);
    },
    'greatBuildings.putList': async ({ world, rows, at }) => {
      await writeList(world, rows, at, false);
    },
    'greatBuildings.putContributions': ({ world, rows, at }) =>
      // one transaction commits once for the whole list
      db.transaction('rw', db.greatBuildings, db.greatBuildingLists, async () => {
        await writeList(world, rows, at, true);
        const listed = new Set(rows.map((r) => gbStringKey({ world, ...r })));
        const gone = await db.greatBuildings
          .where('world')
          .equals(world)
          .filter((b) => !!b.ownContribution && !listed.has(gbStringKey(b)))
          .toArray();
        await db.greatBuildings.bulkDelete(gone.filter((b) => !isFlagged(b)).map(gbKey));
        await db.greatBuildings.bulkPut(gone.filter(isFlagged).map(withoutOwnContribution));
        await db.greatBuildingLists.put({ world, contributionsAt: at });
        return undefined;
      }),
    'greatBuildings.contributionsAt': async ({ world }) => (await db.greatBuildingLists.get(world))?.contributionsAt,
    'greatBuildings.prune': async ({ world, before }) => {
      const stale = (await db.greatBuildings.where('seenAt').below(before).toArray())
        .filter((b) => b.world === world && !hasOwnContribution(b) && !isFlagged(b))
        .map(gbKey);
      await db.greatBuildings.bulkDelete(stale);
      return stale.length;
    },
    'greatBuildings.setFlag': async ({ world, owner, entityId, flag, value, at }) => {
      const row = await db.greatBuildings.get([world, owner, entityId]);
      if (!row) return false;
      // the star and the ignore exclude each other: putting one drops the other in the same write
      const other = OTHER_MARK[flag];
      const { [flag]: _, [other]: otherSet, ...rest } = row;
      await db.greatBuildings.put({
        ...rest,
        ...(value ? { [flag]: true } : otherSet && { [other]: true }),
        marksAt: at,
      });
      return true;
    },
    'greatBuildings.flagged': async ({ world }) => {
      // one scan for both marks, the filter in the cursor: the many unflagged buildings are never collected
      const flagged = await db.greatBuildings.where('world').equals(world).filter(isFlagged).toArray();
      const of = (flag: MarkKind) =>
        flagged.filter((b) => b[flag]).map((b) => ({ owner: b.owner, entityId: b.entityId }));
      return { marked: of('marked'), ignored: of('ignored') };
    },
    'greatBuildings.list': async ({ world, owner, owners }) => {
      const of = (o: PlayerId) => db.greatBuildings.where('[world+owner]').equals([world, o]).toArray();
      if (owners) return (await Promise.all(owners.map(of))).flat();
      return owner === undefined ? db.greatBuildings.where('world').equals(world).toArray() : of(owner);
    },
  };
}
