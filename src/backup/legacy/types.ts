// The data of the old toolbox as read from its databases in the game page. Page scripts can write there too, so every
// row is unknown until a mapper has checked it.

/** `2.x`: FoEToolbox2DB_<id> with its events and notes; `1.x`: FoEToolboxDB_<id> with its events, notes on a server */
export type LegacyVersion = '1.x' | '2.x';

/** The rows of the tables the import takes, one source and schema version. */
export interface LegacyDump {
  /** `neighborhoodAttacks`: battles, plunders, shields */
  attacks: unknown[];
  players: unknown[];
  /** `Events` of the events database */
  events: unknown[];
  /** `groups` of the notes database, 2.x only */
  groups?: unknown[];
  /** `items` of the notes database, 2.x only */
  items?: unknown[];
}

/** The old databases of a profile as found in the game page. */
export interface LegacyFound {
  version: LegacyVersion;
  dump: LegacyDump;
}
