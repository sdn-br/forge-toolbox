// The backup file: export, the backup copy on the game page and the own import share it; the importers of old toolbox
// data translate into it. Gzipped JSON (`.json.gz`), all worlds in one file.
import type {
  Battle,
  CityShield,
  IncomingAttack,
  KnownGreatBuilding,
  NoteGroup,
  NotePage,
  Player,
  Plunder,
} from '../shared/model';

export const BACKUP_FORMAT = 'forge-toolbox-backup';
/** raised when the shape of the file changes; an import maps older versions */
export const BACKUP_VERSION = 1;

/** Only what cannot come back from the game or foestats, and the players it refers to. */
export interface BackupTables {
  battles: Battle[];
  plunders: Plunder[];
  incoming: IncomingAttack[];
  noteGroups: NoteGroup[];
  notePages: NotePage[];
  /** shields still running; ended ones say nothing any more */
  cityShields: CityShield[];
  /** the rows the retention never prunes: own contribution, marked, ignored */
  greatBuildings: KnownGreatBuilding[];
  /** the players the rows above refer to, and the ones the session player marked or ignored */
  players: Player[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: number;
  /** the stored settings (`chrome.storage.local` key `settings`), when there are any */
  settings?: Record<string, unknown>;
  tables: BackupTables;
}

/** `forge-toolbox-backup-2026-10-26.json.gz`, by the local day */
export function backupFileName(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${BACKUP_FORMAT}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json.gz`;
}
