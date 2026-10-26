import { describe, expect, it } from 'vitest';
import { openDb } from '../src/background/db';
import { collectBackup } from '../src/backup/collect';
import { BACKUP_FORMAT, BACKUP_VERSION, backupFileName } from '../src/backup/format';
import { gzipJson } from '../src/backup/gzip';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, KnownGreatBuilding, NotePage, Player } from '../src/shared/model';

const de20 = worldId('de20');
const de10 = worldId('de10');
let dbCount = 0;
const db = () => openDb(`backup-${++dbCount}`);

const player = (world: typeof de20, id: number, change: Partial<Player> = {}): Player => ({
  world,
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
const battle = (world: typeof de20, battleId: number, opponent: number): Battle => ({
  world,
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
const page = (id: string, player?: number): NotePage => ({
  world: de20,
  id,
  group: player === undefined ? 'g1' : 'players',
  title: id,
  text: 'x',
  sort: 0,
  updatedAt: 1,
  ...(player !== undefined && { player: playerId(player) }),
});

describe('collectBackup', () => {
  it('takes the own records of every world, with format, version and settings', async () => {
    const d = db();
    await d.battles.bulkPut([battle(de20, 1, 11), battle(de10, 2, 12)]);
    await d.plunders.put({
      world: de20,
      at: 1,
      opponent: playerId(13),
      outcome: 'repelled',
      resources: {},
      doubleLoot: false,
    });
    await d.incoming.put({ world: de10, kind: 'battle', key: 5, at: 1, attacker: playerId(14), defense: 'held' });
    await d.noteGroups.put({ world: de20, id: 'g1', name: 'Gruppe', sort: 0 });
    await d.notePages.bulkPut([page('a'), page('b', 15)]);

    const backup = await collectBackup(d, { 'pvp.openWithArmy': false }, 1000);

    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: 1000,
      settings: { 'pvp.openWithArmy': false },
    });
    expect(backup.tables.battles.map((b) => b.battleId).sort()).toEqual([1, 2]);
    expect(backup.tables.plunders).toHaveLength(1);
    expect(backup.tables.incoming).toHaveLength(1);
    expect(backup.tables.noteGroups).toHaveLength(1);
    expect(backup.tables.notePages.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('leaves the settings out when none are stored', async () => {
    const backup = await collectBackup(db(), undefined, 1000);
    expect(backup).not.toHaveProperty('settings');
    expect(backup.tables.players).toEqual([]);
  });

  it('keeps only running shields', async () => {
    const d = db();
    await d.cityShields.bulkPut([
      { world: de20, player: playerId(1), expiresAt: 999 },
      { world: de20, player: playerId(2), expiresAt: 2000 },
    ]);
    const backup = await collectBackup(d, undefined, 1000);
    expect(backup.tables.cityShields.map((s) => s.player)).toEqual([playerId(2)]);
  });

  it('keeps the great buildings the retention keeps: own contribution, marked, ignored', async () => {
    const d = db();
    await d.greatBuildings.bulkPut([
      building(1, 1),
      building(2, 2, { ownContribution: true }),
      building(3, 3, { marked: true }),
      building(4, 4, { ignored: true }),
      building(5, 5, { rankings: [{ rank: 2, self: true } as never] }),
    ]);
    const backup = await collectBackup(d, undefined, 1000);
    expect(backup.tables.greatBuildings.map((b) => b.entityId).sort()).toEqual([2, 3, 4, 5]);
  });

  it('takes the players the records refer to and the marked or ignored ones, per world', async () => {
    const d = db();
    await d.battles.put(battle(de20, 1, 11));
    await d.plunders.put({
      world: de20,
      at: 1,
      opponent: playerId(12),
      outcome: 'repelled',
      resources: {},
      doubleLoot: false,
    });
    await d.incoming.put({ world: de20, kind: 'battle', key: 5, at: 1, attacker: playerId(13), defense: 'held' });
    await d.notePages.put(page('n', 14));
    await d.cityShields.put({ world: de20, player: playerId(15), expiresAt: 2000 });
    await d.greatBuildings.put(building(16, 1, { marked: true }));
    await d.players.bulkPut([
      ...[11, 12, 13, 14, 15, 16].map((id) => player(de20, id)),
      player(de20, 17, { marked: true }),
      player(de20, 18, { ignored: true }),
      player(de20, 19),
      // the same id in another world is another player
      player(de10, 11),
    ]);

    const backup = await collectBackup(d, undefined, 1000);

    expect(backup.tables.players.map((p) => `${p.world}/${p.id}`).sort()).toEqual(
      [11, 12, 13, 14, 15, 16, 17, 18].map((id) => `de20/${id}`),
    );
  });
});

describe('backup file', () => {
  it('is gzipped JSON that unpacks to the same value', async () => {
    const value = { format: BACKUP_FORMAT, text: 'Ümlaut ✓', list: [1, 2, 3] };
    const blob = await gzipJson(value);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
    const text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    expect(JSON.parse(text)).toEqual(value);
  });

  it('is named by the local day', () => {
    expect(backupFileName(new Date(2026, 9, 6, 23, 59).getTime())).toBe('forge-toolbox-backup-2026-10-06.json.gz');
  });
});
