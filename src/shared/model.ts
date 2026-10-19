// Domain types that cross the content script / service worker boundary.
import type { EraId, GuildId, PlayerId, WorldId } from './ids';

export interface GuildRef {
  id: GuildId;
  name: string;
  flag?: string;
}

export interface Relations {
  neighbor: boolean;
  guildMember: boolean;
  friend: boolean;
}

export type PlayerSource = 'socialList' | 'visit' | 'ranking' | 'gbg' | 'event';

export interface Player {
  world: WorldId;
  id: PlayerId;
  name: string;
  avatar: string;
  cityName: string;
  era: EraId;
  score: number;
  rank: number;
  active: boolean;
  guild?: GuildRef;
  relations: Relations;
  firstSeenAt: number;
  seenAt: number;
  source: PlayerSource;
}
