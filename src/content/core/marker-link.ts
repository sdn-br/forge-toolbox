import { type MarkerCommand, type MarkerEvent, parseMarkerEvent } from '../../shared/marker-protocol';
import type { MarkerLink } from './markers';
import { pageLink } from './page-link';

/** The marker module in the page over window.postMessage. Without it, or without the game engine, nothing shows. */
const link = pageLink<MarkerCommand, MarkerEvent>(parseMarkerEvent);

export const windowMarkerLink: MarkerLink = {
  post: link.post,
  onRemoved: (listener) => link.on((removed) => listener(removed.seq, removed.ids)),
};
