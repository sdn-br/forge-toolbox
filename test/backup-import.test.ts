import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/background/db';
import { collectBackup, selectSources, sourceKey } from '../src/backup/collect';
import { BACKUP_FORMAT, type BackupFile, type BackupProfile, type BackupTables } from '../src/backup/format';
import { gzipJson } from '../src/backup/gzip';
import { type ImportEnv, importBackup, importChoices, readBackupFile, replaceSummary } from '../src/backup/import';
import {
  type Area,
  addMissing,
  longerShield,
  mergeMarked,
  mergePlayer,
  mergeRows,
  newerPage,
  selectTables,
} from '../src/backup/merge';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, KnownGreatBuilding, NotePage, Player } from '../src/shared/model';

const de20 = worldId('de20');
const me = playerId(1);

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
const battle = (battleId: number, opponent: number, change: Partial<Battle> = {}): Battle => ({
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
const page = (id: string, change: Partial<NotePage> = {}): NotePage => ({
  world: de20,
  id,
  group: 'g1',
  title: id,
  text: 'x',
  sort: 0,
  updatedAt: 1,
  ...change,
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
const backupOf = (...profiles: BackupProfile[]): BackupFile => ({
  format: BACKUP_FORMAT,
  version: 2,
  createdAt: 500,
  profiles,
});
const areas = (...list: Area[]) => new Set(list);

describe('merge rules', () => {
  it('adds a missing immutable row and keeps a stored one', () => {
    const stored = battle(1, 11, { rounds: 5 });
    expect(addMissing(undefined, battle(1, 11))).toEqual(battle(1, 11));
    expect(addMissing(stored, battle(1, 11))).toBeUndefined();
  });

  it('takes the note page edited last', () => {
    expect(newerPage(page('a', { updatedAt: 5 }), page('a', { updatedAt: 9, text: 'new' }))?.text).toBe('new');
    expect(newerPage(page('a', { updatedAt: 9 }), page('a', { updatedAt: 5 }))).toBeUndefined();
    expect(newerPage(page('a', { updatedAt: 5 }), page('a', { updatedAt: 5 }))).toBeUndefined();
    expect(newerPage(undefined, page('a'))).toEqual(page('a'));
  });

  it('keeps the city shield that runs longer', () => {
    const shield = (expiresAt: number) => ({ world: de20, player: playerId(2), expiresAt });
    expect(longerShield(shield(100), shield(200))).toEqual(shield(200));
    expect(longerShield(shield(200), shield(100))).toBeUndefined();
    expect(longerShield(undefined, shield(100))).toEqual(shield(100));
  });

  it('takes game data from the newer seenAt and marks from the newer marksAt', () => {
    const local = player(2, { name: 'old', seenAt: 10, marked: true, marksAt: 50 });
    const source = player(2, { name: 'new', seenAt: 20, ignored: true, marksAt: 40 });
    expect(mergeMarked(local, source)).toEqual(player(2, { name: 'new', seenAt: 20, marked: true, marksAt: 50 }));
  });

  it('takes the newer marks with the older game data', () => {
    const local = player(2, { name: 'local', seenAt: 30, marked: true, marksAt: 5 });
    const source = player(2, { name: 'file', seenAt: 20, marksAt: 9 });
    // the file took the star away later
    expect(mergeMarked(local, source)).toEqual(player(2, { name: 'local', seenAt: 30, marksAt: 9 }));
  });

  it('leaves the local marks when the file row has no marksAt', () => {
    const local = player(2, { seenAt: 10, ignored: true });
    const source = player(2, { name: 'new', seenAt: 20, marked: true });
    expect(mergeMarked(local, source)).toEqual(player(2, { name: 'new', seenAt: 20, ignored: true }));
  });

  it('counts a local row without marksAt as oldest', () => {
    const local = player(2, { seenAt: 10, ignored: true });
    const source = player(2, { seenAt: 5, marked: true, marksAt: 1 });
    expect(mergeMarked(local, source)).toEqual(player(2, { seenAt: 10, marked: true, marksAt: 1 }));
  });

  it('takes the PvP marks from the newer pvpMarksAt, independent of the great building marks and the game data', () => {
    const local = player(2, { seenAt: 30, marked: true, marksAt: 50, plunderWorthy: true, pvpMarksAt: 5 });
    const source = player(2, { seenAt: 20, ignored: true, marksAt: 40, noAttack: true, pvpMarksAt: 9 });
    expect(mergePlayer(local, source)).toEqual(
      player(2, { seenAt: 30, marked: true, marksAt: 50, noAttack: true, pvpMarksAt: 9 }),
    );
  });

  it('leaves the local PvP marks when the file row has none or older ones', () => {
    const local = player(2, { seenAt: 10, plunderWorthy: true, pvpMarksAt: 5 });
    expect(mergePlayer(local, player(2, { seenAt: 20, noAttack: true }))).toEqual(
      player(2, { seenAt: 20, plunderWorthy: true, pvpMarksAt: 5 }),
    );
    expect(mergePlayer(local, player(2, { seenAt: 5, noAttack: true, pvpMarksAt: 4 }))).toBeUndefined();
  });

  it('counts a local row without pvpMarksAt as oldest and merges only a newer PvP mark', () => {
    const local = player(2, { seenAt: 10, noAttack: true });
    const source = player(2, { seenAt: 5, plunderWorthy: true, pvpMarksAt: 1 });
    expect(mergePlayer(local, source)).toEqual(player(2, { seenAt: 10, plunderWorthy: true, pvpMarksAt: 1 }));
  });

  it('keeps the fields a newer row learned from a list lacks, from the richer older row', () => {
    const rich = player(2, {
      name: 'old',
      cityName: 'Burg',
      score: 900,
      rank: 4,
      seenAt: 10,
      marked: true,
      marksAt: 5,
    });
    const { avatar: _, cityName: __, era: ___, score: ____, rank: _____, active: ______, ...rest } = player(2);
    const lean: Player = {
      ...rest,
      name: 'new',
      relations: { neighbor: false, guildMember: false, friend: false },
      seenAt: 20,
      source: 'list',
    };
    // the file's lean row is newer: its name and sighting win, the city and the score stay
    expect(mergePlayer(rich, lean)).toEqual({
      ...rich,
      name: 'new',
      relations: lean.relations,
      seenAt: 20,
      source: 'list',
    });
    // the file's rich row is older than the local lean one: it fills the gaps, the rest stays local
    expect(mergePlayer({ ...lean, seenAt: 30 }, player(2, { cityName: 'Burg', score: 900, seenAt: 10 }))).toEqual({
      ...lean,
      seenAt: 30,
      avatar: '',
      cityName: 'Burg',
      era: eraId('ColonialAge'),
      score: 900,
      rank: 0,
      active: true,
    });
    // nothing to fill and nothing newer: the local row stays
    expect(mergePlayer({ ...lean, seenAt: 30 }, { ...lean, seenAt: 25 })).toBeUndefined();
    expect(mergePlayer({ ...lean, seenAt: 30 }, { ...rich, marksAt: 50 })).toEqual({
      ...rich,
      name: 'new',
      relations: lean.relations,
      seenAt: 30,
      source: 'list',
      marksAt: 50,
    });
    expect(mergePlayer(undefined, lean)).toEqual(lean);
  });

  it('changes nothing when the file row is older in both', () => {
    const local = building(2, 1, { seenAt: 10, marked: true, marksAt: 10 });
    expect(mergeMarked(local, building(2, 1, { seenAt: 5, level: 3, marksAt: 5 }))).toBeUndefined();
    expect(mergeMarked(undefined, building(2, 1))).toEqual(building(2, 1));
  });

  it('applies a rule to each row with its stored counterpart', () => {
    expect(mergeRows([battle(1, 11), battle(2, 12)], [battle(1, 11), undefined], addMissing)).toEqual([battle(2, 12)]);
  });
});

describe('selectTables', () => {
  const all = tables({
    battles: [battle(1, 11)],
    notePages: [page('n', { player: playerId(12) })],
    greatBuildings: [building(13, 1, { marked: true })],
    players: [player(11), player(12), player(13), player(14, { marked: true }), player(15)],
  });
  const ids = (t: BackupTables) => t.players.map((p) => p.id);

  it('takes the chosen areas with the players they refer to and the marked ones', () => {
    const picked = selectTables(all, areas('pvp'));
    expect(picked.battles).toHaveLength(1);
    expect(picked.notePages).toEqual([]);
    expect(picked.greatBuildings).toEqual([]);
    expect(ids(picked)).toEqual([11, 14]);
    expect(ids(selectTables(all, areas('notes', 'greatBuildings')))).toEqual([12, 13, 14]);
  });

  it('takes no players for the settings alone', () => {
    expect(selectTables(all, areas('settings')).players).toEqual([]);
  });
});

describe('readBackupFile', () => {
  const json = (value: unknown) => new Blob([JSON.stringify(value)]);

  it('reads a gzipped and a plain file', async () => {
    const backup = backupOf({ world: de20, player: me, tables: tables({ battles: [battle(1, 11)] }) });
    expect(await readBackupFile(await gzipJson(backup))).toEqual({ ok: true, backup });
    expect(await readBackupFile(json(backup))).toEqual({ ok: true, backup });
  });

  it('refuses another version, a foreign file and broken data', async () => {
    expect(await readBackupFile(json({ ...backupOf(), version: 1 }))).toEqual({ ok: false, error: 'version' });
    expect(await readBackupFile(json({ some: 'thing' }))).toEqual({ ok: false, error: 'notBackup' });
    expect(await readBackupFile(new Blob(['not json']))).toEqual({ ok: false, error: 'notJson' });
    const broken = { ...backupOf(), profiles: [{ world: de20, tables: { battles: [] } }] };
    expect(await readBackupFile(json(broken))).toEqual({ ok: false, error: 'notBackup' });
  });
});

describe('importChoices', () => {
  const full = (player?: number): BackupProfile => ({
    world: de20,
    ...(player !== undefined && { player: playerId(player) }),
    settings: { x: true },
    tables: tables({ battles: [battle(1, 11)], cityShields: [{ world: de20, player: playerId(11), expiresAt: 9 }] }),
  });

  it('counts the rows per area and preselects all, the settings only without local ones', () => {
    const [mine, other] = importChoices(backupOf(full(1), full(2)), (p) => p.player === 1);
    expect(mine?.counts).toEqual({ pvp: 2, notes: 0, greatBuildings: 0, settings: 1 });
    expect(mine?.checked).toEqual({ pvp: true, notes: false, greatBuildings: false, settings: false });
    expect(other?.checked.settings).toBe(true);
    expect(mine?.importable).toBe(true);
  });

  it('offers nothing of a world without player', () => {
    const [legacy] = importChoices(backupOf(full()), () => false);
    expect(legacy?.importable).toBe(false);
    expect(Object.values(legacy?.checked ?? {})).toEqual([false, false, false, false]);
  });
});

describe('importBackup', () => {
  afterEach(async () => {
    for (const { name } of await indexedDB.databases()) if (name?.startsWith('forge-toolbox')) await Dexie.delete(name);
  });
  const storage = (values: Record<string, unknown> = {}) => {
    const env: ImportEnv & { values: Record<string, unknown> } = {
      values,
      open: openDb,
      get: async (keys) => Object.fromEntries(keys.filter((k) => k in values).map((k) => [k, values[k]])),
      set: async (items) => {
        Object.assign(values, items);
      },
    };
    return env;
  };

  it('merges into the stored profile and reports what it wrote', async () => {
    const db = openDb('forge-toolbox:de20:1');
    await db.battles.put(battle(1, 11, { rounds: 7 }));
    await db.notePages.bulkPut([page('a', { updatedAt: 9, text: 'local' }), page('b', { updatedAt: 1 })]);
    await db.players.put(player(11, { seenAt: 50, name: 'local' }));
    db.close();
    const env = storage({ 'settings:de20:1': { old: true } });
    const entry: BackupProfile = {
      world: de20,
      player: me,
      name: 'Ich',
      settings: { new: true },
      tables: tables({
        battles: [battle(1, 11), battle(2, 11)],
        notePages: [page('a', { updatedAt: 5, text: 'file' }), page('b', { updatedAt: 3, text: 'file' })],
        players: [player(11, { seenAt: 10, name: 'file', marked: true, marksAt: 3 })],
      }),
    };

    const counts = await importBackup([{ profile: entry, areas: areas('pvp', 'notes') }], 500, env);

    expect(counts).toEqual({ profiles: 1, pvp: 1, notes: 1, greatBuildings: 0, players: 1, settings: 0 });
    const after = openDb('forge-toolbox:de20:1');
    expect((await after.battles.get([de20, 1]))?.rounds).toBe(7);
    expect(await after.battles.count()).toBe(2);
    expect((await after.notePages.toArray()).map((p) => p.text)).toEqual(['local', 'file']);
    expect(await after.players.get([de20, playerId(11)])).toMatchObject({ name: 'local', marked: true, marksAt: 3 });
    after.close();
    // the settings were not chosen, the name was missing
    expect(env.values['settings:de20:1']).toEqual({ old: true });
    expect(env.values['profile:de20:1']).toEqual({ name: 'Ich', seenAt: 500 });
  });

  it('creates the database of a profile new here and replaces the chosen settings', async () => {
    const env = storage({ 'settings:de20:2': { old: true }, 'profile:de20:2': { name: 'Bekannt', seenAt: 1 } });
    const entry: BackupProfile = {
      world: de20,
      player: playerId(2),
      name: 'Neu',
      settings: { new: true },
      tables: tables({ greatBuildings: [building(13, 1, { marked: true })], players: [player(13)] }),
    };

    const counts = await importBackup([{ profile: entry, areas: areas('greatBuildings', 'settings') }], 500, env);

    expect(counts).toEqual({ profiles: 1, pvp: 0, notes: 0, greatBuildings: 1, players: 1, settings: 1 });
    expect(await Dexie.exists('forge-toolbox:de20:2')).toBe(true);
    const db = openDb('forge-toolbox:de20:2');
    expect(await db.greatBuildings.count()).toBe(1);
    db.close();
    expect(env.values['settings:de20:2']).toEqual({ new: true });
    expect(env.values['profile:de20:2']).toEqual({ name: 'Bekannt', seenAt: 1 });
  });

  it('skips a world without player and a profile without chosen areas', async () => {
    const env = storage();
    const entry: BackupProfile = { world: de20, tables: tables({ battles: [battle(1, 11)] }) };
    const counts = await importBackup(
      [
        { profile: entry, areas: areas('pvp') },
        { profile: { ...entry, player: me }, areas: areas() },
      ],
      500,
      env,
    );
    expect(counts.profiles).toBe(0);
    expect(await Dexie.exists('forge-toolbox:de20:1')).toBe(false);
  });
});

describe('replaceSummary', () => {
  const entry = (player: number, change: Partial<BackupTables> = {}): BackupProfile => ({
    world: de20,
    player: playerId(player),
    settings: { x: true },
    tables: tables(change),
  });

  it('names per stored profile the chosen data areas and which of them the file leaves empty', () => {
    const choices = importChoices(
      backupOf(entry(1, { battles: [battle(1, 11)] }), entry(2, { notePages: [page('a')] })),
      () => false,
    );
    const [mine, other] = choices;
    if (!mine || !other) throw new Error('two choices expected');
    mine.checked.notes = true;

    expect(replaceSummary(choices, () => true)).toEqual([
      {
        profile: mine.profile,
        areas: [
          { area: 'pvp', empty: false },
          { area: 'notes', empty: true },
        ],
      },
      { profile: other.profile, areas: [{ area: 'notes', empty: false }] },
    ]);
  });

  it('leaves out a profile new here, one without chosen data areas and a world without player', () => {
    const choices = importChoices(
      backupOf(entry(1, { battles: [battle(1, 11)] }), entry(2), { world: de20, tables: tables() }),
      () => false,
    );
    expect(replaceSummary(choices, (p) => p.player === 2)).toEqual([]);
  });
});

describe('importBackup replacing', () => {
  afterEach(async () => {
    for (const { name } of await indexedDB.databases()) if (name?.startsWith('forge-toolbox')) await Dexie.delete(name);
  });
  const env = (values: Record<string, unknown> = {}): ImportEnv & { values: Record<string, unknown> } => ({
    values,
    open: openDb,
    get: async (keys) => Object.fromEntries(keys.filter((k) => k in values).map((k) => [k, values[k]])),
    set: async (items) => {
      Object.assign(values, items);
    },
  });
  const stored = async () => {
    const db = openDb('forge-toolbox:de20:1');
    await db.battles.bulkPut([battle(1, 11, { rounds: 7 }), battle(9, 11)]);
    await db.cityShields.put({ world: de20, player: playerId(11), expiresAt: 99 });
    await db.noteGroups.put({ world: de20, id: 'local', name: 'local', sort: 0 });
    await db.notePages.put(page('local', { group: 'local' }));
    await db.greatBuildings.put(building(13, 1, { level: 50 }));
    await db.players.bulkPut([player(11, { seenAt: 50, name: 'local' }), player(14, { marked: true, marksAt: 1 })]);
    db.close();
  };
  const entry = (change: Partial<BackupTables>): BackupProfile => ({
    world: de20,
    player: me,
    settings: { new: true },
    tables: tables(change),
  });

  it('empties the chosen areas and fills them from the file, merging the players', async () => {
    await stored();
    const file = entry({
      battles: [battle(1, 11), battle(2, 11)],
      greatBuildings: [building(13, 1, { level: 3 })],
      players: [player(11, { seenAt: 10, name: 'file' })],
    });

    const counts = await importBackup([{ profile: file, areas: areas('pvp', 'notes') }], 500, env(), 'replace');

    expect(counts).toEqual({ profiles: 1, pvp: 2, notes: 0, greatBuildings: 0, players: 0, settings: 0 });
    const db = openDb('forge-toolbox:de20:1');
    expect(await db.battles.toArray()).toEqual([battle(1, 11), battle(2, 11)]);
    expect(await db.cityShields.count()).toBe(0);
    // the notes were chosen but the file has none: they end up empty
    expect(await db.noteGroups.count()).toBe(0);
    expect(await db.notePages.count()).toBe(0);
    // not chosen, untouched
    expect((await db.greatBuildings.get([de20, playerId(13), 1]))?.level).toBe(50);
    // players are merged, never replaced
    expect((await db.players.get([de20, playerId(11)]))?.name).toBe('local');
    expect(await db.players.get([de20, playerId(14)])).toMatchObject({ marked: true });
    db.close();
  });

  it('replaces the chosen settings as merging does', async () => {
    const values = env({ 'settings:de20:1': { old: true } });
    await importBackup([{ profile: entry({}), areas: areas('settings') }], 500, values, 'replace');
    expect(values.values['settings:de20:1']).toEqual({ new: true });
  });

  it('fills a profile new here like merging', async () => {
    const file = entry({ battles: [battle(1, 11)], players: [player(11)] });
    const counts = await importBackup([{ profile: file, areas: areas('pvp') }], 500, env(), 'replace');
    expect(counts).toMatchObject({ profiles: 1, pvp: 1, players: 1 });
  });

  it('keeps the old rows when filling fails', async () => {
    await stored();
    const broken = { ...battle(2, 11), battleId: undefined } as unknown as Battle;
    const file = entry({ battles: [broken] });

    await expect(importBackup([{ profile: file, areas: areas('pvp') }], 500, env(), 'replace')).rejects.toThrow();

    const db = openDb('forge-toolbox:de20:1');
    expect(await db.battles.count()).toBe(2);
    expect(await db.cityShields.count()).toBe(1);
    db.close();
  });
});

describe('export selection', () => {
  afterEach(async () => {
    for (const { name } of await indexedDB.databases()) if (name?.startsWith('export-')) await Dexie.delete(name);
  });

  it('exports only the chosen sources, each with its stored name', async () => {
    const a = openDb('export-a');
    const b = openDb('export-b');
    const sources = [
      { world: de20, player: me, name: 'Ich', db: a },
      { world: de20, player: playerId(2), db: b },
      { world: worldId('de10'), db: b },
    ];
    expect(sources.map(sourceKey)).toEqual(['de20:1', 'de20:2', 'de10:']);

    const backup = await collectBackup(selectSources(sources, new Set(['de20:1', 'de10:'])), 1000);
    a.close();
    b.close();

    expect(backup.profiles.map((p) => [p.world, p.player, p.name])).toEqual([
      [de20, me, 'Ich'],
      [worldId('de10'), undefined, undefined],
    ]);
  });
});
