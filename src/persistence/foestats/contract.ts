import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay, FoestatsOutcome } from '../../shared/model';

/** what the views learn about foestats and the player: foestats is unreachable, or it does not know the player */
export interface FoestatsState {
  unreachable: boolean;
  unknown: boolean;
}

export interface FoestatsApi {
  /**
   * Whether the content script should ask foestats about the player now: not this foestats day yet, and foestats was
   * not unreachable a short while ago. A `fetch: true` reserves the request, so another view of the player gets
   * `fetch: false` until it is stored.
   */
  'foestats.claim': { arg: { world: WorldId; player: PlayerId }; result: { fetch: boolean } & FoestatsState };
  /**
   * What a claimed request to foestats came to. Keeps the snapshot day and the day before it and remembers the request
   * per player; an unreachable foestats is remembered for all players instead.
   */
  'foestats.store': {
    arg: { world: WorldId; player: PlayerId; outcome: FoestatsOutcome };
    result: FoestatsState;
  };
  /** the known days of the player, oldest first */
  'foestats.history': { arg: { world: WorldId; player: PlayerId }; result: FoestatsDay[] };
}
