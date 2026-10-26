// The backup file: export, the backup copy on the game page and the own import share it; the importers of old toolbox
// data translate into it. Gzipped JSON (`.json.gz`), all profiles in one file, each with its own settings and tables.
// Version 1 had one block of settings and one set of tables for all worlds, from the time before profiles.
import type { PlayerId, WorldId } from '../shared/ids';
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
export const BACKUP_VERSION = 2;

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

/** One profile: a world and the own player id, with its settings and rows. */
export interface BackupProfile {
  world: WorldId;
  /**
   * absent for the rows of a world still in the database of the time before profiles (`forge-toolbox`), which no
   * profile has taken over yet
   */
  player?: PlayerId;
  /**
   * the stored settings of the profile (`chrome.storage.local` key `settings:<world>:<player>`), when there are any;
   * without a player the global settings of the time before profiles
   */
  settings?: Record<string, unknown>;
  tables: BackupTables;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: number;
  profiles: BackupProfile[];
}

/** `forge-toolbox-backup-2026-10-26.json.gz`, by the local day */
export function backupFileName(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${BACKUP_FORMAT}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json.gz`;
}
