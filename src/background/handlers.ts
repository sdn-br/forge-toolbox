import type { FetchLike } from '../content/stores/foestats-api';
import { assetsHandlers } from '../persistence/assets/worker';
import { backupHandlers } from '../persistence/backup/worker';
import { buildingDefsHandlers } from '../persistence/building-defs/worker';
import { foestatsHandlers } from '../persistence/foestats/worker';
import { greatBuildingsHandlers } from '../persistence/great-buildings/worker';
import { incomingHandlers } from '../persistence/incoming/worker';
import { notesHandlers } from '../persistence/notes/worker';
import { playersHandlers } from '../persistence/players/worker';
import { pvpHandlers } from '../persistence/pvp/worker';
import { scoredbHandlers } from '../persistence/scoredb/worker';
import { shieldsHandlers } from '../persistence/shields/worker';
import type { BackgroundApi, Handlers } from '../shared/rpc';
import type { ToolboxDb } from './db';

/** what the handlers reach outside the database: the clock, the requests to the Inno CDN and to ScoreDB; tests pass their own */
export interface HandlerDeps {
  now: () => number;
  /** the text of the file at `url`; throws when it cannot be read */
  fetchText: (url: string) => Promise<string>;
  /** a request to an outside site such as ScoreDB, with its status; throws on a network error */
  fetchPage: FetchLike;
}

export function createHandlers(db: ToolboxDb, deps: HandlerDeps): Handlers<BackgroundApi> {
  return {
    ...playersHandlers(db),
    ...pvpHandlers(db),
    ...incomingHandlers(db),
    ...notesHandlers(db),
    ...shieldsHandlers(db),
    ...greatBuildingsHandlers(db),
    ...foestatsHandlers(db, deps),
    ...scoredbHandlers(deps),
    ...backupHandlers(db, deps),
    ...assetsHandlers(db, deps),
    ...buildingDefsHandlers(db, deps),
  };
}
