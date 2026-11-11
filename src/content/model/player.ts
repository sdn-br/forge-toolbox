import type { EraId, PlayerId } from '../../shared/ids';
import type { AttackTimer, GuildRef } from '../../shared/model';

/** What one game response tells about a player. `guild: null` means "no guild", not "unknown". */
export interface PlayerObservation {
  id: PlayerId;
  name: string;
  avatar: string;
  cityName: string;
  era: EraId;
  /** missing keeps what is known, as from an accepted friend invitation */
  score?: number;
  rank?: number;
  active: boolean;
  guild: GuildRef | null;
  /** only from sources that carry the whole player with its timers; missing keeps what is known */
  attack?: AttackTimer;
}

/**
 * What a great building list tells about the owner of a row: the id, the name and maybe the avatar. The ranking window
 * also tells city, era and guild.
 */
export interface ListedPlayer {
  id: PlayerId;
  name: string;
  /** missing or empty keeps what is known */
  avatar?: string;
  /** missing keeps what is known */
  cityName?: string;
  era?: EraId;
  /** `null` means "no guild"; missing keeps what is known. The flag of the same guild stays */
  guild?: GuildRef | null;
}
