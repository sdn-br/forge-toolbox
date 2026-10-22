import type { HistoryPoint } from '../../shared/foestats-api';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay } from '../../shared/model';

export interface FoestatsApi {
  /**
   * Whether the content script should ask foestats about the player now: not this foestats day yet, or again after a
   * failure. A `fetch: true` reserves the request, so another view of the player gets `fetch: false` until it is stored.
   * `unreachable` tells that the last request failed.
   */
  'foestats.claim': { arg: { world: WorldId; player: PlayerId }; result: { fetch: boolean; unreachable: boolean } };
  /**
   * What foestats answered to a claimed request; a missing history means it did not answer. Keeps the new days only
   * when both histories arrived, and remembers the request either way.
   */
  'foestats.store': {
    arg: { world: WorldId; player: PlayerId; points?: HistoryPoint[]; battles?: HistoryPoint[] };
    result: { unreachable: boolean };
  };
  /** the known days of the player, oldest first */
  'foestats.history': { arg: { world: WorldId; player: PlayerId }; result: FoestatsDay[] };
}
