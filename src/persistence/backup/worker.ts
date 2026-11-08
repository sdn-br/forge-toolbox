import type { ToolboxDb } from '../../background/db';
import type { HandlerDeps } from '../../background/handlers';
import { collectTables } from '../../backup/collect';
import { areaCounts, importLegacy, importTables, newLegacyTables } from '../../backup/import';
import { DATA_AREAS } from '../../backup/merge';
import type { Handlers } from '../../shared/rpc';
import type { BackupApi } from './contract';

/** the rows come from the export, the merge from the import of a file */
export function backupHandlers(db: ToolboxDb, deps: Pick<HandlerDeps, 'now'>): Handlers<BackupApi> {
  return {
    'backup.tables': ({ world }) => collectTables(db, world, deps.now()),
    'backup.merge': ({ entry, areas, mode }) => importTables(db, entry, new Set(areas), mode ?? 'merge'),
    'backup.legacyCounts': async ({ entry }) =>
      areaCounts({ ...entry, tables: await newLegacyTables(db, entry, new Set(DATA_AREAS)) }),
    'backup.mergeLegacy': ({ entry, areas }) => importLegacy(db, entry, new Set(areas)),
  };
}
