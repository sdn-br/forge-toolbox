import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsOutcome } from '../../shared/model';

export interface ScoredbApi {
  /**
   * Reads the page of the player at ScoreDB from the service worker (ScoreDB sends no CORS headers, so the game page
   * cannot) and tells what it came to; the content script hands the outcome to `foestats.store` like one of foestats.
   * Never fails: a missing answer is `'unreachable'`.
   */
  'scoredb.player': { arg: { world: WorldId; player: PlayerId }; result: FoestatsOutcome };
}
