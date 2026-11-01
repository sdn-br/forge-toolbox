// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { BackupProfile } from '../src/backup/format';
import { mapToolbox2 } from '../src/backup/legacy/mapper';
import { backupPersistence } from '../src/persistence/backup/client';
import { playerId, worldId } from '../src/shared/ids';
import v2 from './fixtures/legacy-toolbox2.json';
import { battle } from './helpers/backup';
import { testDb } from './helpers/battle-db';

const de20 = worldId('de20');
const NOW = Date.UTC(2026, 9, 27, 12);

const entry = (): BackupProfile => ({
  world: de20,
  player: playerId(1001),
  tables: mapToolbox2(
    { attacks: v2.neighborhoodAttacks, players: v2.players, events: v2.Events, groups: v2.groups, items: v2.items },
    { world: de20, player: playerId(1001) },
    NOW,
  ).tables,
});

describe('old toolbox data through the service worker', () => {
  it('counts per area what the profile does not hold yet', async () => {
    const db = testDb();
    // the new toolbox recorded the first battle too, a minute later
    await db.db.battles.put({ ...battle(900, 2001), at: Date.parse('2026-10-18T08:21:10.000Z') });
    const counts = await backupPersistence(db.call).legacyCounts(entry());
    // 3 battles but the known one, 3 plunders, 2 attacks on the own city; 2 groups and 5 pages
    expect(counts).toEqual({ pvp: 7, notes: 7, greatBuildings: 0, settings: 0 });
  });

  it('merges the chosen areas without the known rows, and a second import adds nothing', async () => {
    const db = testDb();
    await db.db.battles.put({ ...battle(900, 2001), at: Date.parse('2026-10-18T08:21:10.000Z') });
    const backup = backupPersistence(db.call);
    expect(await backup.mergeLegacy(entry(), ['pvp'])).toEqual({ pvp: 7, notes: 0, greatBuildings: 0, players: 4 });
    // the plunders after the lost and the surrendered battle get inferred battles, the first one links the known one
    expect((await db.db.battles.toArray()).map((b) => b.battleId).sort((a, b) => a - b)).toEqual([
      -Date.parse('2026-10-21T07:15:00.000Z'),
      -Date.parse('2026-10-20T12:00:00.000Z'),
      -Date.parse('2026-10-19T10:00:00.000Z'),
      -Date.parse('2026-10-19T09:58:00.000Z'),
      900,
    ]);
    expect((await db.db.battles.get([de20, 900]))?.plunderAt).toBe(Date.parse('2026-10-18T08:31:54.508Z'));
    expect(await db.db.notePages.count()).toBe(0);
    expect((await db.db.players.toArray()).map((p) => p.id).sort()).toEqual([2001, 2002, 2003, 2006]);

    expect(await backup.mergeLegacy(entry(), ['pvp', 'notes'])).toMatchObject({ pvp: 0, notes: 7, players: 1 });
    expect(await backup.mergeLegacy(entry(), ['pvp', 'notes'])).toEqual({
      pvp: 0,
      notes: 0,
      greatBuildings: 0,
      players: 0,
    });
    expect(await backup.legacyCounts(entry())).toEqual({ pvp: 0, notes: 0, greatBuildings: 0, settings: 0 });
  });
});
