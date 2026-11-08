import { describe, expect, expectTypeOf, it } from 'vitest';
import { openDb } from '../src/background/db';
import { collectTables } from '../src/backup/collect';
import type { BackupTables } from '../src/backup/format';
import { DATA_AREAS } from '../src/backup/merge';
import { BACKUP_TABLES, emptyTables, TABLE_NAMES, tablesOf } from '../src/backup/tables';
import { de20 } from './helpers/backup';

describe('the registry of the backed up tables', () => {
  it('has an entry for exactly the tables of the backup file', async () => {
    // a table of the file without an entry, or an entry without a table, does not compile
    expectTypeOf<keyof typeof BACKUP_TABLES>().toEqualTypeOf<keyof BackupTables>();
    const collected = Object.keys(await collectTables(openDb('tables-1'), de20, 0));
    expect(TABLE_NAMES).toEqual(collected);
    expect(Object.keys(emptyTables())).toEqual(collected);
  });

  it('puts each table in the area of the import it belonged to before the registry', () => {
    expect(Object.fromEntries(DATA_AREAS.map((area) => [area, tablesOf(area)]))).toEqual({
      pvp: ['battles', 'plunders', 'incoming', 'cityShields'],
      notes: ['noteGroups', 'notePages'],
      greatBuildings: ['greatBuildings'],
    });
    expect(tablesOf('players')).toEqual(['players']);
  });

  it('keeps the rules which writes change the backup', () => {
    const changes = Object.fromEntries(TABLE_NAMES.map((name) => [name, BACKUP_TABLES[name].changes]));
    expect(changes).toEqual({
      battles: 'every',
      plunders: 'every',
      incoming: 'every',
      noteGroups: 'every',
      notePages: 'every',
      cityShields: 'every',
      greatBuildings: ['marksAt', 'ownContribution', 'contribution'],
      players: ['marksAt', 'pvpMarksAt'],
    });
  });
});
