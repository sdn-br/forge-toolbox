import { parseMarkerEvent } from '../../shared/marker-protocol';
import type { MarkerLink } from './markers';

/** The marker module in the page over window.postMessage. Without it, or without the game engine, nothing shows. */
export const windowMarkerLink: MarkerLink = {
  post: (command) => window.postMessage(command, location.origin),
  onRemoved: (listener) =>
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const removed = parseMarkerEvent(event.data);
      if (removed) listener(removed.seq, removed.ids);
    }),
};
