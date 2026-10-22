import type { FoestatsStatus } from '../../persistence/foestats/contract';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsDay } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import { logError } from '../core/log';
import type { ToggleSettingDef } from '../core/settings';

export interface FoestatsPersistence {
  /** asks foestats unless that was done this foestats day; never fails for a missing answer */
  update(world: WorldId, player: PlayerId): Promise<FoestatsStatus>;
  /** the known days of the player, oldest first */
  history(world: WorldId, player: PlayerId): Promise<FoestatsDay[]>;
}

/** Off: no requests to foestats, and the views hide what they know from it. Links to foestats stay. */
export const FOESTATS_SETTING: ToggleSettingDef = {
  key: 'foestats.fetch',
  group: 'foestats.group',
  label: 'foestats.fetchSetting',
  hint: 'foestats.fetchHint',
  default: true,
};

export interface FoestatsRecord {
  /** oldest first */
  days: FoestatsDay[];
  /** foestats did not answer the last time it was asked */
  unreachable: boolean;
}

/**
 * Days of players at foestats, kept in the database. A view of a player asks the service worker to append the days
 * foestats has new (at most once a day), then reads them from the database.
 */
export class FoestatsStore {
  private records = new Map<PlayerId, FoestatsRecord>();

  constructor(
    private bus: ToolboxBus,
    private world: WorldId,
    private persistence: FoestatsPersistence,
  ) {}

  /** what is known about the player after the last `view` */
  get(player: PlayerId): FoestatsRecord | undefined {
    return this.records.get(player);
  }

  /** a view shows the player: bring the days up to date and read them */
  async view(player: PlayerId): Promise<void> {
    try {
      const status = await this.persistence.update(this.world, player);
      const days = await this.persistence.history(this.world, player);
      this.records.set(player, { days, unreachable: status === 'unreachable' });
      this.bus.emit('foestats.updated', { player });
    } catch (error) {
      logError('loading foestats data failed', error);
    }
  }
}
