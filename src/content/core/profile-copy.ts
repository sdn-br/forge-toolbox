// Copies the settings and the box layout of another profile into the own one, for a new world or a second account.
import { PROFILE_KEYS, type Profile, profileOfStorageKey, profileStorageKey, sameProfile } from '../../shared/profile';
import { assertAlive } from './extension-context';
import { compareText, t } from './texts';

/** the part of chrome.storage.local the copy uses */
export interface ProfileStorage {
  /** every key with its value */
  all(): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export const chromeProfileStorage: ProfileStorage = {
  all: async () => {
    assertAlive();
    return chrome.storage.local.get(null);
  },
  set: async (items) => {
    assertAlive();
    await chrome.storage.local.set(items);
  },
  remove: async (keys) => {
    assertAlive();
    await chrome.storage.local.remove(keys);
  },
};

export interface OtherProfile {
  profile: Profile;
  /** the player name the profile last started with, missing for a profile that never saved one */
  name?: string;
}

/** `de10 · Name`, or the player id when the name is not known */
export const profileLabel = ({ profile, name }: OtherProfile): string =>
  t('settings.copyFromOption', { world: profile.world, name: name ?? String(profile.player) });

/** Every profile with settings except `current`, by world and then by name. */
export function otherProfiles(all: Record<string, unknown>, current: Profile): OtherProfile[] {
  const others = Object.keys(all).flatMap((key) => {
    const profile = profileOfStorageKey(key, 'settings');
    if (!profile || sameProfile(profile, current)) return [];
    const name = (all[profileStorageKey('profile', profile)] as { name?: unknown } | undefined)?.name;
    return [typeof name === 'string' && name ? { profile, name } : { profile }];
  });
  const sortName = (p: OtherProfile) => p.name ?? String(p.profile.player);
  return others.sort((a, b) => a.profile.world.localeCompare(b.profile.world) || compareText(sortName(a), sortName(b)));
}

/** Replaces the copied keys of `to` with those of `from`; a key `from` lacks is removed at `to`. */
export async function copyProfileSettings(storage: ProfileStorage, from: Profile, to: Profile): Promise<void> {
  const all = await storage.all();
  const items: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const key of PROFILE_KEYS) {
    const value = all[profileStorageKey(key, from)];
    if (value === undefined) missing.push(profileStorageKey(key, to));
    else items[profileStorageKey(key, to)] = value;
  }
  if (Object.keys(items).length) await storage.set(items);
  if (missing.length) await storage.remove(missing);
}

/** What the settings box needs: the other profiles, and the copy from one of them, which reloads the game after. */
export interface ProfileCopy {
  others(): Promise<OtherProfile[]>;
  copyFrom(from: Profile): Promise<void>;
}

/** `reload` restarts the game page, so settings and boxes load anew from the copied keys */
export function profileCopy(storage: ProfileStorage, current: Profile, reload: () => void): ProfileCopy {
  return {
    others: async () => otherProfiles(await storage.all(), current),
    copyFrom: async (from) => {
      await copyProfileSettings(storage, from, current);
      reload();
    },
  };
}

/** chrome.storage.local in memory, for tests */
export function memoryProfileStorage(initial: Record<string, unknown> = {}): ProfileStorage & {
  data: Map<string, unknown>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    all: async () => Object.fromEntries(data),
    set: async (items) => {
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    },
    remove: async (keys) => {
      for (const key of keys) data.delete(key);
    },
  };
}
