import type { ToolboxDb } from '../../background/db';
import { collectTables } from '../../backup/collect';
import { areaCounts, importLegacy, importTables, newLegacyTables } from '../../backup/import';
import { DATA_AREAS } from '../../backup/merge';
import type { Handlers } from '../../shared/rpc';
import type { BackupApi } from './contract';

/** the rows come from the export, the merge from the import of the data page */
export function backupHandlers(db: ToolboxDb, deps: { now: () => number }): Handlers<BackupApi> {
  return {
    'backup.tables': ({ world }) => collectTables(db, world, deps.now()),
    'backup.merge': ({ entry, areas }) => importTables(db, entry, new Set(areas), 'merge'),
    'backup.legacyCounts': async ({ entry }) =>
      areaCounts({ ...entry, tables: await newLegacyTables(db, entry, new Set(DATA_AREAS)) }),
    'backup.mergeLegacy': ({ entry, areas }) => importLegacy(db, entry, new Set(areas)),
  };
}
