import type Dexie from 'dexie';
import { relinkPvp } from '../persistence/pvp/worker';
import type { PlayerId, WorldId } from '../shared/ids';
import type { Battle, Plunder } from '../shared/model';
import { renameCityEntityId } from '../shared/rename-def';

/** The whole version history lives here; the domains in src/persistence only bring their tables. */
export function defineVersions(db: Dexie): void {
  db.version(1).stores({
    players: '[world+id], world, seenAt',
  });
  db.version(2).stores({
    battles: '[world+battleId], [world+at], [world+opponent+at], at',
  });
  db.version(3).stores({
    plunders: '[world+opponent+entityId+at], [world+at], [world+opponent+at], at',
  });
  // version 3 keyed plunders by their building, which a repelled plunder lacks. Dexie cannot change a primary key, so
  // version 4 drops the table (it was never released, nothing is lost) and version 5 builds it anew.
  db.version(4).stores({ plunders: null });
  // the game sends no id with a plunder and allows one per neighbour and day, so opponent and time make it one
  db.version(5).stores({
    plunders: '[world+opponent+at], [world+at], at',
  });
  // attacks on the own city: a battle is keyed by its battle id, a plunder by its event id
  db.version(6).stores({
    incoming: '[world+kind+key], [world+at], [world+attacker+at], at',
  });
  // notes per world; the content script keeps them all in memory, so the world is the only index
  db.version(7).stores({
    noteGroups: '[world+id], world',
    notePages: '[world+id], world',
  });
  // city shields of other players, one per player; a new one replaces it, ended ones are pruned by their end
  db.version(8).stores({
    cityShields: '[world+player], expiresAt',
  });
  // last known state of other players' great buildings for the snipe helper, one row per building
  db.version(9).stores({
    greatBuildings: '[world+owner+entityId], [world+owner], world, seenAt',
  });
  // days of players at foestats, one row per player and day, appended at most once a day; and when each was asked
  db.version(10).stores({
    foestatsDays: '[world+player+date], [world+player]',
    foestatsFetches: '[world+player]',
  });
  // there is no version 11: it only added fields to great buildings, which needs no schema change
  // when the town hall list of the own contributions last came, one row per world
  db.version(12).stores({
    greatBuildingLists: 'world',
  });
  // a plunder belongs to the latest won battle against its opponent in the 24 h before it; battles carry the time of
  // their plunder, and a plunder without a stored battle gets an inferred one. The schema stays, the upgrade links what
  // is stored; a database without plunders stays as it is
  db.version(13)
    .stores({})
    .upgrade(async (tx) => {
      const plunders = tx.table<Plunder, [WorldId, PlayerId, number]>('plunders');
      const battles = tx.table<Battle, [WorldId, number]>('battles');
      await relinkPvp({ battles, plunders }, await plunders.toArray());
    });
  // the asset index of the game's script by its URL, only the newest; no world, not in the backup
  db.version(14).stores({
    assetIndexes: 'script',
  });
  // the metadata files of building definitions the toolbox loaded itself, one per id; no world, not in the backup
  db.version(15).stores({
    buildingDefFiles: 'id',
  });
  // the building definition of a plunder, an incoming plunder and a known great building is called `def` everywhere in
  // the model, as in `Building.def`; it was `cityEntityId`. No index names it, so the schema stays and the upgrade
  // renames the field of the stored rows
  db.version(16)
    .stores({})
    .upgrade(async (tx) => {
      for (const name of ['plunders', 'incoming', 'greatBuildings']) {
        await tx
          .table(name)
          .toCollection()
          .modify((row: Record<string, unknown>) => renameCityEntityId(row));
      }
    });
}
