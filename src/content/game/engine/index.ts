// What only the game engine tells: the page module reads it in the page context and the readers here turn its answers
// into bus events. Beside the game traffic (`game/handlers.ts`) the second input from the game; like the traffic it
// only adds to what the stores and features know, and without an answer nothing more happens.
import type { ToolboxBus } from '../../core/events';
import { watchArmyTarget, windowArmyLink } from './army-target';
import { watchGbWindow, windowGbWindowLink } from './gb-window';

/** Starts the readers on the page module; tests drive each reader with their own link. */
export function watchEngine(bus: ToolboxBus): void {
  watchArmyTarget(bus, windowArmyLink);
  watchGbWindow(bus, windowGbWindowLink);
}
