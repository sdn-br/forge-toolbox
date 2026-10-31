import type { FoestatsState } from '../../persistence/foestats/contract';
import type { FoestatsAnswer, FoestatsClient } from '../../shared/foestats-api';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import { toggleDef } from '../core/settings';

export interface FoestatsPersistence {
  /** whether to ask foestats now; `fetch: true` reserves the request until `store` */
  claim(world: WorldId, player: PlayerId): Promise<{ fetch: boolean } & FoestatsState>;
  /** what foestats answered to a claimed request */
  store(world: WorldId, player: PlayerId, answer: FoestatsAnswer): Promise<FoestatsState>;
  /** the known days of the player, oldest first */
  history(world: WorldId, player: PlayerId): Promise<FoestatsDay[]>;
}

/** Off: no requests to foestats, and the views hide what they know from it. Links to foestats stay. */
export const FOESTATS_SETTING = toggleDef({
  key: 'foestats.fetch',
  group: 'foestats.group',
  label: 'foestats.fetchSetting',
  hint: 'foestats.fetchHint',
  default: true,
});

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
export type FoestatsRequests = Pick<FoestatsClient, 'player'>;

/**
 * Days of players at foestats, kept in the database. A view of a player asks the service worker whether a request is
 * due (at most once a day), asks foestats for the daily snapshot from the content script, hands it to the service
 * worker to keep its days, then reads the days from the database. The history grows from these snapshots.
 */
export class FoestatsStore {
  private records = new Map<PlayerId, FoestatsRecord>();
  /** views of a player running in this tab; a second one waits for the first */
  private running = new Map<PlayerId, Promise<void>>();

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

  /** a view shows the player: bring the days up to date and read them */
  view(player: PlayerId): Promise<void> {
    let pending = this.running.get(player);
    if (!pending) {
      pending = this.update(player).finally(() => this.running.delete(player));
      this.running.set(player, pending);
    }
    return pending;
  }

  private async update(player: PlayerId): Promise<void> {
    const before = this.records.get(player);
    this.records.set(player, {
      days: before?.days ?? [],
      unreachable: before?.unreachable ?? false,
      unknown: before?.unknown ?? false,
      loading: true,
    });
    this.bus.emit('foestats.updated', { player });
    try {
      const { fetch, ...claimed } = await this.persistence.claim(this.world, player);
      let state = claimed;
      if (fetch) {
        // the request never fails, a missing answer is 'unreachable'
        const answer = await this.requests.player(this.world, player);
        state = await this.persistence.store(this.world, player, answer);
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
