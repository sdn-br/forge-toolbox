import type { Table } from 'dexie';
import { describe, expect, it } from 'vitest';
import { openDb, type ToolboxDb } from '../src/background/db';
import { collectTables } from '../src/backup/collect';
import { type BackupTables, playersToKeep, referencedPlayers } from '../src/backup/format';
import { hasOwnContribution, isFlagged } from '../src/shared/great-buildings';
import { buildingDefId, eraId, playerId, type WorldId, worldId } from '../src/shared/ids';
import type { KnownGreatBuilding, Player } from '../src/shared/model';
import { battle, de20 } from './helpers/backup';

let dbCount = 0;
const de10 = worldId('de10');

const player = (id: number, change: Partial<Player> = {}): Player => ({
  world: de20,
  id: playerId(id),
  name: `p${id}`,
  avatar: '',
  cityName: '',
  era: eraId('ColonialAge'),
  score: 0,
  rank: 0,
  active: true,
  relations: { neighbor: true, guildMember: false, friend: false },
  firstSeenAt: 1,
  seenAt: 1,
  source: 'socialList',
  ...change,
});
const building = (owner: number, entityId: number, change: Partial<KnownGreatBuilding> = {}): KnownGreatBuilding => ({
  world: de20,
  owner: playerId(owner),
  entityId,
  cityEntityId: buildingDefId('X_Arc'),
  level: 10,
  invested: 0,
  required: 100,
  seenAt: 1,
  ...change,
});

/** the collection as it read every table in full and filtered afterwards, the reference the cursor filters must meet */
async function readInFull(db: ToolboxDb, world: WorldId, now: number): Promise<BackupTables> {
  const all = <T extends { world: string }, K>(table: Table<T, K>) =>
    table.toArray().then((rows) => rows.filter((r) => r.world === world));
  const [battles, plunders, incoming, noteGroups, notePages, shields, buildings, allPlayers] = await Promise.all([
    all(db.battles),
    all(db.plunders),
    all(db.incoming),
    all(db.noteGroups),
    all(db.notePages),
    all(db.cityShields),
    all(db.greatBuildings),
    all(db.players),
  ]);
  const cityShields = shields.filter((s) => s.expiresAt > now);
  const greatBuildings = buildings.filter((b) => isFlagged(b) || hasOwnContribution(b));
  const referenced = referencedPlayers({ battles, plunders, incoming, notePages, cityShields, greatBuildings });
  const players = playersToKeep(allPlayers, referenced);
  return { battles, plunders, incoming, noteGroups, notePages, cityShields, greatBuildings, players };
}

describe('collecting the backup rows of a world', () => {
  it('keeps the same rows in the same order as reading every table in full', async () => {
    const db = openDb(`collect-${++dbCount}`);
    // written out of order, with rows of another world, as the old database holds them
    await db.players.bulkPut([
      player(40),
      player(3, { marked: true, marksAt: 1 }),
      player(25),
      player(12, { ignored: true }),
      player(7),
      player(30, { plunderWorthy: true, pvpMarksAt: 1 }),
      player(18, { noAttack: true }),
      player(2),
      player(50),
      player(60),
      player(70),
      player(3, { world: de10, marked: true }),
      player(7, { world: de10 }),
    ]);
    await db.battles.bulkPut([battle(1, 7), battle(2, 99), { ...battle(3, 40), world: de10 }]);
    await db.incoming.put({ world: de20, kind: 'battle', key: 1, at: 1, attacker: playerId(25) });
    await db.notePages.put({
      world: de20,
      id: 'n',
      group: 'g',
      title: 'p2',
      text: '',
      sort: 0,
      updatedAt: 1,
      player: playerId(2),
    });
    await db.cityShields.bulkPut([
      { world: de20, player: playerId(50), expiresAt: 200 },
      { world: de20, player: playerId(40), expiresAt: 100 },
    ]);
    await db.greatBuildings.bulkPut([
      building(60, 1, { marked: true }),
      building(60, 2),
      building(70, 1, { rankings: [{ rank: 2, name: 'me', self: true, fp: 5 }] }),
      building(25, 1, { ignored: true }),
      building(18, 4, { ownContribution: true }),
      building(40, 1),
      building(60, 1, { world: de10, marked: true }),
    ]);

    for (const [world, now] of [
      [de20, 150],
      [de20, 50],
      [de10, 150],
    ] as const) {
      const collected = await collectTables(db, world, now);
      expect(collected).toEqual(await readInFull(db, world, now));
    }
    const players = (await collectTables(db, de20, 150)).players.map((p) => p.id);
    expect(players).toEqual([2, 3, 7, 12, 18, 25, 30, 50, 60, 70]);
    db.close();
  });
});
