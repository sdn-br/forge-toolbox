// Everything stored belongs to a profile: the world and the own player id of the session. Each profile has its own
// database and its own keys in chrome.storage.local, so one account never sees the rows of another.
import { type PlayerId, playerId, type WorldId, worldId } from './ids';

export interface Profile {
  world: WorldId;
  player: PlayerId;
}

/** the keys of chrome.storage.local a profile owns besides its rows: settings and box layout with the view choices */
export const PROFILE_KEYS = ['settings', 'ui.boxes', 'ui.prefs'];

/** whether two entries name the same profile; an entry without a player (time before profiles) matches only the same */
export const sameProfile = (a: { world: WorldId; player?: PlayerId }, b: { world: WorldId; player?: PlayerId }) =>
  a.world === b.world && a.player === b.player;

/** the database of the time before profiles, all worlds in one, with global settings */
export const LEGACY_DB = 'forge-toolbox';

const DB_PREFIX = `${LEGACY_DB}:`;

/** `forge-toolbox:de20:12345` */
export const profileDbName = (profile: Profile): string => `${DB_PREFIX}${profile.world}:${profile.player}`;

/** the profile of a database name, or null for any other database */
export function profileOfDbName(name: string): Profile | null {
  const match = name.startsWith(DB_PREFIX) ? /^([^:]+):(\d+)$/.exec(name.slice(DB_PREFIX.length)) : null;
  return match ? { world: worldId(match[1] as string), player: playerId(Number(match[2])) } : null;
}

/** `settings` → `settings:de20:12345` */
export const profileStorageKey = (key: string, profile: Profile): string => `${key}:${profile.world}:${profile.player}`;

/** `settings:de20:12345` → the profile, when the storage key belongs to `key`; null for any other key */
export function profileOfStorageKey(storageKey: string, key: string): Profile | null {
  const match = storageKey.startsWith(`${key}:`) ? /^([^:]+):(\d+)$/.exec(storageKey.slice(key.length + 1)) : null;
  return match ? { world: worldId(match[1] as string), player: playerId(Number(match[2])) } : null;
}

/** a request may come from a page script posing as the content script, so the service worker checks the shape */
export function isProfile(value: unknown): value is Profile {
  const p = value as Partial<Profile> | null;
  return (
    typeof p?.world === 'string' &&
    /^[^:]+$/.test(p.world) &&
    typeof p.player === 'number' &&
    Number.isSafeInteger(p.player) &&
    p.player >= 0
  );
}
