import type { ToolboxDb } from '../../background/db';
import { collectTables } from '../../backup/collect';
import { importTables } from '../../backup/import';
import type { Handlers } from '../../shared/rpc';
import type { BackupApi } from './contract';

/** the rows come from the export, the merge from the import of the data page */
export function backupHandlers(db: ToolboxDb, deps: { now: () => number }): Handlers<BackupApi> {
  return {
    'backup.tables': ({ world }) => collectTables(db, world, deps.now()),
    'backup.merge': ({ entry, areas }) => importTables(db, entry, new Set(areas), 'merge'),
  };
}
