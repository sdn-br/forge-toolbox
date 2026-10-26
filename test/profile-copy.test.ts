import { describe, expect, it, vi } from 'vitest';
import {
  copyProfileSettings,
  memoryProfileStorage,
  otherProfiles,
  profileCopy,
  profileLabel,
} from '../src/content/core/profile-copy';
import { playerId, worldId } from '../src/shared/ids';
import { type Profile, profileOfStorageKey } from '../src/shared/profile';

const profile = (world: string, player: number): Profile => ({ world: worldId(world), player: playerId(player) });
const own = profile('de20', 1);

describe('the other profiles', () => {
  it('lists every profile with settings except the own one, by world and then by name', () => {
    const all = {
      'settings:de20:1': {},
      'settings:de20:2': {},
      'profile:de20:2': { name: 'Zora', seenAt: 1 },
      'settings:de20:3': {},
      'profile:de20:3': { name: 'anna', seenAt: 1 },
      'settings:de10:4': {},
      'settings:en1:5': {},
      'profile:en1:5': { name: 'Bob', seenAt: 1 },
      // a profile without settings has nothing to copy
      'profile:de20:6': { name: 'Empty', seenAt: 1 },
      'ui.boxes:de20:7': {},
      settings: {},
      'profiles.seen': [],
    };
    const others = otherProfiles(all, own);
    expect(others).toEqual([
      { profile: profile('de10', 4) },
      { profile: profile('de20', 3), name: 'anna' },
      { profile: profile('de20', 2), name: 'Zora' },
      { profile: profile('en1', 5), name: 'Bob' },
    ]);
    expect(others.map(profileLabel)).toEqual(['de10 · 4', 'de20 · anna', 'de20 · Zora', 'en1 · Bob']);
  });

  it('is empty when only the own profile has settings', () => {
    expect(otherProfiles({ 'settings:de20:1': {}, 'profile:de20:1': { name: 'Me' } }, own)).toEqual([]);
  });

  it('reads the profile of a storage key only for the key asked', () => {
    expect(profileOfStorageKey('settings:de20:12', 'settings')).toEqual(profile('de20', 12));
    expect(profileOfStorageKey('ui.boxes:de20:12', 'settings')).toBeNull();
    expect(profileOfStorageKey('settings', 'settings')).toBeNull();
    expect(profileOfStorageKey('settings:de20', 'settings')).toBeNull();
    expect(profileOfStorageKey('settings:de20:x', 'settings')).toBeNull();
  });
});

describe('copying the settings of another profile', () => {
  it('replaces settings, boxes and view choices, removes what the source lacks and leaves the rest', async () => {
    const storage = memoryProfileStorage({
      'settings:de10:4': { a: true },
      'ui.boxes:de10:4': { pvp: { x: 5 } },
      'profile:de10:4': { name: 'Other' },
      'settings:de20:1': { a: false },
      'ui.boxes:de20:1': { pvp: { x: 1 } },
      'ui.prefs:de20:1': { map: 'grid' },
      'profile:de20:1': { name: 'Me' },
    });
    await copyProfileSettings(storage, profile('de10', 4), own);
    expect(Object.fromEntries(storage.data)).toEqual({
      'settings:de10:4': { a: true },
      'ui.boxes:de10:4': { pvp: { x: 5 } },
      'profile:de10:4': { name: 'Other' },
      'settings:de20:1': { a: true },
      'ui.boxes:de20:1': { pvp: { x: 5 } },
      'profile:de20:1': { name: 'Me' },
    });
  });

  it('reloads the game once the keys are written', async () => {
    const storage = memoryProfileStorage({ 'settings:de10:4': { a: true } });
    const reload = vi.fn(() => expect(storage.data.get('settings:de20:1')).toEqual({ a: true }));
    const copy = profileCopy(storage, own, reload);
    expect(await copy.others()).toEqual([{ profile: profile('de10', 4) }]);
    await copy.copyFrom(profile('de10', 4));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
