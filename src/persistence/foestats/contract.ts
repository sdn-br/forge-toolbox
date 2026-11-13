import type { DataSource } from '../../shared/activity-source';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay, FoestatsOutcome, FoestatsState } from '../../shared/model';

export interface FoestatsApi {
  /**
   * Whether the content script should ask the site (`source`, foestats when missing) about the player now: not this
   * foestats day yet, and the site was not unreachable a short while ago. A `fetch: true` reserves the request, so
   * another view of the player gets `fetch: false` until it is stored.
   */
  'foestats.claim': {
    arg: { world: WorldId; player: PlayerId; source?: DataSource };
    result: { fetch: boolean } & FoestatsState;
  };
  /**
   * What a claimed request to the site came to. Keeps the reported days, fills a gap with a worked out day and
   * remembers the request per player; an unreachable site is remembered for all players instead.
   */
  'foestats.store': {
    arg: { world: WorldId; player: PlayerId; outcome: FoestatsOutcome; source?: DataSource };
    result: FoestatsState;
  };
  /** the known days of the player, oldest first */
  'foestats.history': { arg: { world: WorldId; player: PlayerId }; result: FoestatsDay[] };
}
