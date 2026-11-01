import { type AssetsDeps, assetsHandlers } from '../persistence/assets/worker';
import { backupHandlers } from '../persistence/backup/worker';
import { battlesHandlers } from '../persistence/battles/worker';
import { type FoestatsDeps, foestatsHandlers } from '../persistence/foestats/worker';
import { greatBuildingsHandlers } from '../persistence/great-buildings/worker';
import { incomingHandlers } from '../persistence/incoming/worker';
import { notesHandlers } from '../persistence/notes/worker';
import { playersHandlers } from '../persistence/players/worker';
import { plundersHandlers } from '../persistence/plunders/worker';
import { shieldsHandlers } from '../persistence/shields/worker';
import type { BackgroundApi, Handlers } from '../shared/rpc';
import type { ToolboxDb } from './db';

/** what the handlers reach outside the database */
export type HandlerDeps = FoestatsDeps & AssetsDeps;

/** `deps` reach outside the database: the clock and the requests to the Inno CDN */
export function createHandlers(db: ToolboxDb, deps: HandlerDeps): Handlers<BackgroundApi> {
  return {
    ...playersHandlers(db),
    ...battlesHandlers(db),
    ...plundersHandlers(db),
    ...incomingHandlers(db),
    ...notesHandlers(db),
    ...shieldsHandlers(db),
    ...greatBuildingsHandlers(db),
    ...foestatsHandlers(db, deps),
    ...backupHandlers(db, deps),
    ...assetsHandlers(db, deps),
  };
}
