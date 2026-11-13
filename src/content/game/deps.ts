import type { WorldId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { Stores } from '../stores';

/** The stores the responses feed, plus what the handlers need besides them. */
export type GameHandlerDeps = Stores & {
  world: WorldId;
  bus: ToolboxBus;
  now: () => number;
};
