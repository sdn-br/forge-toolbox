import { battlesHandlers } from '../persistence/battles/worker';
import { incomingHandlers } from '../persistence/incoming/worker';
import { notesHandlers } from '../persistence/notes/worker';
import { playersHandlers } from '../persistence/players/worker';
import { plundersHandlers } from '../persistence/plunders/worker';
import { shieldsHandlers } from '../persistence/shields/worker';
import type { BackgroundApi, Handlers } from '../shared/rpc';
import type { ToolboxDb } from './db';

export function createHandlers(db: ToolboxDb): Handlers<BackgroundApi> {
  return {
    ...playersHandlers(db),
    ...battlesHandlers(db),
    ...plundersHandlers(db),
    ...incomingHandlers(db),
    ...notesHandlers(db),
    ...shieldsHandlers(db),
  };
}
