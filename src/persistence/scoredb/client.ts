import type { Call } from '../../content/core/rpc';
import type { FoestatsRequests } from '../../content/stores/foestats';

/** The requests to ScoreDB, made by the service worker: the game page cannot read ScoreDB past CORS. */
export function scoredbRequests(call: Call): FoestatsRequests {
  return {
    player: (world, player) => call('scoredb.player', { world, player }),
  };
}
