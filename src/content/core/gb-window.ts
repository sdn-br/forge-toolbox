// Tells which great building window the game shows, as gbWindow.changed. The game traffic says when a list or a great
// building opens, but not when its window closes; the page module reads that from the game engine. After the first
// list or great building it watches, and from then on reports each change. Without an answer nothing more happens.
import {
  GB_WINDOW_TAG,
  type GbWindowCommand,
  type GbWindowEvent,
  type GbWindowState,
  parseGbWindowEvent,
} from '../../shared/gb-window-protocol';
import type { ToolboxBus } from './events';
import { pageLink } from './page-link';

/** The way to the page module; tests bring their own. */
export interface GbWindowLink {
  post(command: GbWindowCommand): void;
  onState(listener: (state: GbWindowState) => void): void;
}

const link = pageLink<GbWindowCommand, GbWindowEvent>(parseGbWindowEvent);

export const windowGbWindowLink: GbWindowLink = {
  post: link.post,
  onState: (listener) => link.on((changed) => listener(changed.state)),
};

export function watchGbWindow(bus: ToolboxBus, link: GbWindowLink): void {
  /** the page starts from none; a repeated state is no change, so a box opened by hand meanwhile stays */
  let last: GbWindowState = 'none';
  link.onState((state) => {
    if (state === last) return;
    last = state;
    bus.emit('gbWindow.changed', { state });
  });
  // the page ignores the ask while it watches; asking each time lets it try again when the engine was not found yet
  const watch = () => link.post({ tag: GB_WINDOW_TAG, from: 'content', type: 'watch' });
  bus.on('greatBuildings.listed', watch);
  bus.on('greatBuilding.opened', watch);
}
