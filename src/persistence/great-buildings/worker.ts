import type { Table } from 'dexie';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import type { GreatBuildingListRow, GreatBuildingsApi } from './contract';
import { applyListRow, gbKey, growthSince, hasOwnContribution, isFlagged, withoutOwnContribution } from './merge';

/** when the town hall list of the own contributions last came in a world */
export interface GreatBuildingListTimes {
  world: WorldId;
  contributionsAt: number;
}

export type GreatBuildingsTables = {
  greatBuildings: Table<KnownGreatBuilding, [WorldId, PlayerId, number]>;
  greatBuildingLists: Table<GreatBuildingListTimes, WorldId>;
};

/** what an opened building does not tell, so the stored row keeps it (the ranking window brought the tier) */
const KEPT = ['ownContribution', 'marked', 'ignored', 'marksAt', 'tier'] as const;

const kept = (before: KnownGreatBuilding | undefined) =>
  Object.fromEntries(KEPT.flatMap((k) => (before?.[k] !== undefined && before[k] !== false ? [[k, before[k]]] : [])));

export function greatBuildingsHandlers(db: GreatBuildingsTables): Handlers<GreatBuildingsApi> {
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
        const k = gbKey(row).join(':');
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
    'greatBuildings.putContributions': async ({ world, rows, at }) => {
      await writeList(world, rows, at, true);
      const listed = new Set(rows.map((r) => gbKey({ world, ...r }).join(':')));
      const gone = (await db.greatBuildings.where('world').equals(world).toArray()).filter(
        (b) => b.ownContribution && !listed.has(gbKey(b).join(':')),
      );
      await db.greatBuildings.bulkDelete(gone.filter((b) => !isFlagged(b)).map(gbKey));
      await db.greatBuildings.bulkPut(gone.filter(isFlagged).map(withoutOwnContribution));
      await db.greatBuildingLists.put({ world, contributionsAt: at });
    },
    'greatBuildings.contributionsAt': async ({ world }) => (await db.greatBuildingLists.get(world))?.contributionsAt,
    'greatBuildings.prune': async ({ world, before }) => {
      const stale = (await db.greatBuildings.where('seenAt').below(before).toArray())
        .filter((b) => b.world === world && !hasOwnContribution(b) && !isFlagged(b))
        .map(gbKey);
      await db.greatBuildings.bulkDelete(stale);
    },
    'greatBuildings.setFlag': async ({ world, owner, entityId, flag, value, at }) => {
      const row = await db.greatBuildings.get([world, owner, entityId]);
      if (!row) return false;
      // the star and the ignore exclude each other: putting one drops the other in the same write
      const other = flag === 'marked' ? 'ignored' : 'marked';
      const { [flag]: _, [other]: otherSet, ...rest } = row;
      await db.greatBuildings.put({
        ...rest,
        ...(value ? { [flag]: true } : otherSet && { [other]: true }),
        marksAt: at,
      });
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
