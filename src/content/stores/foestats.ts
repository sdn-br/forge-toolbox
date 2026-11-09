import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay, FoestatsOutcome, FoestatsState } from '../../shared/model';
import { singleFlight } from '../../shared/single-flight';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import type { FoestatsClient } from '../game/foestats-api';

export interface FoestatsPersistence {
  /** whether to ask foestats now; `fetch: true` reserves the request until `store` */
  claim(world: WorldId, player: PlayerId): Promise<{ fetch: boolean } & FoestatsState>;
  /** what a claimed request came to, in the domain model */
  store(world: WorldId, player: PlayerId, outcome: FoestatsOutcome): Promise<FoestatsState>;
  /** the known days of the player, oldest first */
  history(world: WorldId, player: PlayerId): Promise<FoestatsDay[]>;
}

export interface FoestatsRecord {
  /** oldest first */
  days: FoestatsDay[];
  /** foestats did not answer the last time it was asked, about any player */
  unreachable: boolean;
  /** foestats does not know the player */
  unknown: boolean;
  /** a view is bringing the days up to date; until then `days` is what was known before, maybe nothing */
  loading: boolean;
}

/** the requests the store makes to foestats */
type FoestatsRequests = Pick<FoestatsClient, 'player'>;

/**
 * Days of players at foestats, kept in the database. A view of a player asks the service worker whether a request is
 * due (at most once a day), asks foestats for the daily snapshot from the content script, hands it to the service
 * worker to keep its days, then reads the days from the database. The history grows from these snapshots.
 */
export class FoestatsStore {
  private records = new Map<PlayerId, FoestatsRecord>();

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: FoestatsPersistence,
    private requests: FoestatsRequests,
  ) {}

  /** what is known about the player after the last `view` */
  get(player: PlayerId): FoestatsRecord | undefined {
    return this.records.get(player);
  }

  /** a view shows the player: bring the days up to date and read them; a second view of a player running waits for the first */
  view = singleFlight((player: PlayerId) => this.update(player));

  private async update(player: PlayerId): Promise<void> {
    // what is known stays on show while it is brought up to date; only a player without a record is loading
    if (!this.records.has(player)) {
      this.records.set(player, { days: [], unreachable: false, unknown: false, loading: true });
      this.bus.emit('foestats.updated', { player });
    }
    try {
      const { fetch, ...claimed } = await this.persistence.claim(this.world, player);
      let state = claimed;
      if (fetch) {
        // the request never fails, a missing answer is 'unreachable'
        const outcome = await this.requests.player(this.world, player);
        state = await this.persistence.store(this.world, player, outcome);
      }
      const days = await this.persistence.history(this.world, player);
      this.records.set(player, { days, ...state, loading: false });
    } catch (error) {
      logError('loading foestats data failed', error);
      const record = this.records.get(player);
      if (record) this.records.set(player, { ...record, loading: false });
    }
    this.bus.emit('foestats.updated', { player });
  }
}
