import { describe, expect, it } from 'vitest';
import type { BackupProfile, BackupTables } from '../src/backup/format';
import { backupPersistence } from '../src/persistence/backup/client';
import { eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, Player } from '../src/shared/model';
import { testDb } from './helpers/battle-db';

const de20 = worldId('de20');

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
const battle = (battleId: number, opponent: number): Battle => ({
  world: de20,
  battleId,
  at: 1,
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
});
const tables = (change: Partial<BackupTables> = {}): BackupTables => ({
  battles: [],
  plunders: [],
  incoming: [],
  noteGroups: [],
  notePages: [],
  cityShields: [],
  greatBuildings: [],
  players: [],
  ...change,
});

describe('backup calls of the service worker', () => {
  it('reads what the backup holds of the profile, without the players nothing refers to', async () => {
    const { call, db } = testDb({ now: () => 100 });
    await db.battles.put(battle(1, 2));
    await db.players.bulkPut([player(2), player(3), player(4, { marked: true, marksAt: 5 })]);
    const backup = backupPersistence(call);
    const read = await backup.tables(de20);
    expect(read.battles).toEqual([battle(1, 2)]);
    expect(read.players.map((p) => p.id)).toEqual([2, 4]);
  });

  it('merges the chosen data areas of a profile entry and leaves the rest', async () => {
    const { call, db } = testDb();
    await db.battles.put(battle(1, 2));
    const entry: BackupProfile = {
      world: de20,
      player: playerId(1),
      settings: { a: true },
      tables: tables({
        battles: [battle(1, 2), battle(5, 2)],
        notePages: [{ world: de20, id: 'n', group: 'g', title: 'n', text: 'x', sort: 0, updatedAt: 1 }],
        players: [player(2)],
      }),
    };
    await backupPersistence(call).merge(entry, ['pvp', 'settings']);
    expect((await db.battles.toArray()).map((b) => b.battleId)).toEqual([1, 5]);
    expect(await db.notePages.count()).toBe(0);
    expect(await db.players.count()).toBe(1);
  });
});
