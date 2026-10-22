import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay } from '../../shared/model';

/** `fetched`: foestats was asked now; `fresh`: it was asked this foestats day already; `unreachable`: it did not answer */
export type FoestatsStatus = 'fetched' | 'fresh' | 'unreachable';

export interface FoestatsApi {
  /** asks foestats about the player unless that was done this foestats day, and keeps the days not known yet */
  'foestats.update': { arg: { world: WorldId; player: PlayerId }; result: { status: FoestatsStatus } };
  /** the known days of the player, oldest first */
  'foestats.history': { arg: { world: WorldId; player: PlayerId }; result: FoestatsDay[] };
}
