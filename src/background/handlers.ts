import { battlesHandlers } from '../persistence/battles/worker';
import { playersHandlers } from '../persistence/players/worker';
import { plundersHandlers } from '../persistence/plunders/worker';
import type { BackgroundApi, Handlers } from '../shared/rpc';
import type { ToolboxDb } from './db';

export function createHandlers(db: ToolboxDb): Handlers<BackgroundApi> {
  return { ...playersHandlers(db), ...battlesHandlers(db), ...plundersHandlers(db) };
}
