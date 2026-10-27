import type { BackupProfile, BackupTables } from '../../backup/format';
import type { ImportedRows } from '../../backup/import';
import type { Area } from '../../backup/merge';
import type { WorldId } from '../../shared/ids';

/** The backup copy on the game page: the content script reads the rows for it and merges a found copy back. */
export interface BackupApi {
  /** what an export of the profile would hold of `world`, without the settings */
  'backup.tables': { arg: { world: WorldId }; result: BackupTables };
  /** merges the chosen data areas of a profile entry; settings are left to the caller */
  'backup.merge': { arg: { entry: BackupProfile; areas: Area[] }; result: ImportedRows };
  /** rows per area of old toolbox data the profile does not hold yet */
  'backup.legacyCounts': { arg: { entry: BackupProfile }; result: Record<Area, number> };
  /** merges the chosen areas of old toolbox data, leaving out what the profile holds already */
  'backup.mergeLegacy': { arg: { entry: BackupProfile; areas: Area[] }; result: ImportedRows };
}
