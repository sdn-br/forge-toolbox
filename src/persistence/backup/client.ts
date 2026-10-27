import type { BackupProfile, BackupTables } from '../../backup/format';
import type { ImportedRows } from '../../backup/import';
import type { Area } from '../../backup/merge';
import type { Call } from '../../content/core/rpc';
import type { WorldId } from '../../shared/ids';

export interface BackupPersistence {
  tables(world: WorldId): Promise<BackupTables>;
  merge(entry: BackupProfile, areas: Area[]): Promise<ImportedRows>;
  /** rows per area of old toolbox data the profile does not hold yet */
  legacyCounts(entry: BackupProfile): Promise<Record<Area, number>>;
  mergeLegacy(entry: BackupProfile, areas: Area[]): Promise<ImportedRows>;
}

/** Persistence through the service worker, which owns the database. */
export function backupPersistence(call: Call): BackupPersistence {
  return {
    tables: (world) => call('backup.tables', { world }),
    merge: (entry, areas) => call('backup.merge', { entry, areas }),
    legacyCounts: (entry) => call('backup.legacyCounts', { entry }),
    mergeLegacy: (entry, areas) => call('backup.mergeLegacy', { entry, areas }),
  };
}
