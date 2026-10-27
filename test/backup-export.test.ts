import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type ToolboxDb } from '../src/background/db';
import { type BackupSource, closeBackupSources, collectBackup, openBackupSources } from '../src/backup/collect';
import { BACKUP_FORMAT, BACKUP_VERSION, backupFileName } from '../src/backup/format';
import { gzipJson } from '../src/backup/gzip';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, KnownGreatBuilding, NotePage, Player } from '../src/shared/model';

const de20 = worldId('de20');
const de10 = worldId('de10');
let dbCount = 0;
const db = () => openDb(`backup-${++dbCount}`);
const me = playerId(1);
/** one profile on de20 */
async function collect(d: ToolboxDb) {
  const [profile] = (await collectBackup([{ world: de20, player: me, db: d }], 1000)).profiles;
  if (!profile) throw new Error('no profile');
  return profile;
}

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
  it('takes the own records of each source, with format, version and settings', async () => {
    const d = db();
    await d.battles.bulkPut([battle(de20, 1, 11), battle(de20, 2, 12)]);
    await d.plunders.put({
      world: de20,
      at: 1,
      opponent: playerId(13),
      outcome: 'repelled',
      resources: {},
      doubleLoot: false,
    });
    await d.incoming.put({ world: de20, kind: 'battle', key: 5, at: 1, attacker: playerId(14), defense: 'held' });
    await d.noteGroups.put({ world: de20, id: 'g1', name: 'Gruppe', sort: 0 });
    await d.notePages.bulkPut([page('a'), page('b', 15)]);

    const backup = await collectBackup(
      [{ world: de20, player: me, db: d, settings: { 'pvp.openWithArmy': false } }],
      1000,
    );

    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: 1000 });
    expect(BACKUP_VERSION).toBe(2);
    expect(backup.profiles).toHaveLength(1);
    const [profile] = backup.profiles;
    expect(profile).toMatchObject({ world: de20, player: me, settings: { 'pvp.openWithArmy': false } });
    expect(profile?.tables.battles.map((b) => b.battleId).sort()).toEqual([1, 2]);
    expect(profile?.tables.plunders).toHaveLength(1);
    expect(profile?.tables.incoming).toHaveLength(1);
    expect(profile?.tables.noteGroups).toHaveLength(1);
    expect(profile?.tables.notePages.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('takes only the rows of its world from a shared database, as the old one is', async () => {
    const d = db();
    await d.battles.bulkPut([battle(de20, 1, 11), battle(de10, 2, 12)]);
    const backup = await collectBackup(
      [
        { world: de10, db: d },
        { world: de20, db: d },
      ],
      1000,
    );
    expect(backup.profiles.map((p) => [p.world, p.player, p.tables.battles.map((b) => b.battleId)])).toEqual([
      [de10, undefined, [2]],
      [de20, undefined, [1]],
    ]);
    expect(backup.profiles[0]).not.toHaveProperty('player');
  });

  it('leaves the settings out when none are stored', async () => {
    const profile = await collect(db());
    expect(profile).not.toHaveProperty('settings');
    expect(profile.tables.players).toEqual([]);
  });

  it('keeps only running shields', async () => {
    const d = db();
    await d.cityShields.bulkPut([
      { world: de20, player: playerId(1), expiresAt: 999 },
      { world: de20, player: playerId(2), expiresAt: 2000 },
    ]);
    const profile = await collect(d);
    expect(profile.tables.cityShields.map((s) => s.player)).toEqual([playerId(2)]);
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
    const profile = await collect(d);
    expect(profile.tables.greatBuildings.map((b) => b.entityId).sort()).toEqual([2, 3, 4, 5]);
  });

  it('takes the players the records refer to and the marked or ignored ones, of its world', async () => {
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

    const profile = await collect(d);

    expect(profile.tables.players.map((p) => `${p.world}/${p.id}`).sort()).toEqual(
      [11, 12, 13, 14, 15, 16, 17, 18].map((id) => `de20/${id}`),
    );
  });
});

describe('openBackupSources', () => {
  const storage = (values: Record<string, unknown>) => async (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => k in values).map((k) => [k, values[k]]));
  let opened: BackupSource[] = [];
  afterEach(async () => {
    closeBackupSources(opened);
    opened = [];
    for (const { name } of await indexedDB.databases()) if (name?.startsWith('forge-toolbox')) await Dexie.delete(name);
  });

  it('gives one entry per profile database, with the settings and the name of the profile', async () => {
    const a = openDb('forge-toolbox:de20:1');
    const b = openDb('forge-toolbox:de20:2');
    await a.battles.put(battle(de20, 1, 11));
    await b.battles.put(battle(de20, 2, 12));
    a.close();
    b.close();

    opened = await openBackupSources(
      storage({
        'settings:de20:1': { x: true },
        'profile:de20:1': { name: 'Ich', seenAt: 1 },
        settings: { old: true },
      }),
    );
    const backup = await collectBackup(opened, 1000);

    expect(
      backup.profiles.map((p) => [p.world, p.player, p.name, p.settings, p.tables.battles.map((x) => x.battleId)]),
    ).toEqual([
      [de20, 1, 'Ich', { x: true }, [1]],
      [de20, 2, undefined, undefined, [2]],
    ]);
  });

  it('adds one entry per world of the old database while it exists, with the old settings', async () => {
    const profile = openDb('forge-toolbox:de20:1');
    await profile.battles.put(battle(de20, 1, 11));
    profile.close();
    const legacy = openDb('forge-toolbox');
    await legacy.battles.put(battle(de10, 2, 12));
    await legacy.greatBuildingLists.put({ world: worldId('en5'), contributionsAt: 1 });
    legacy.close();

    opened = await openBackupSources(storage({ settings: { old: true } }));
    const backup = await collectBackup(opened, 1000);

    expect(backup.profiles.map((p) => [p.world, p.player, p.settings])).toEqual([
      [de20, 1, undefined],
      [de10, undefined, { old: true }],
      [worldId('en5'), undefined, { old: true }],
    ]);
    expect(backup.profiles[1]?.tables.battles.map((x) => x.battleId)).toEqual([2]);
  });

  it('does not create the old database when it is gone', async () => {
    opened = await openBackupSources(storage({}));
    expect(opened).toEqual([]);
    expect(await Dexie.exists('forge-toolbox')).toBe(false);
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
