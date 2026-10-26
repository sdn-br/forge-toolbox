// Small key-value persistence for settings and UI state (chrome.storage.local, not the game page's localStorage).
import { type Profile, profileStorageKey } from '../../shared/profile';
import { assertAlive } from './extension-context';

export interface KeyValue {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export const chromeLocal: KeyValue = {
  get: async <T>(key: string) => {
    assertAlive();
    return (await chrome.storage.local.get(key))[key] as T | undefined;
  },
  set: async (key, value) => {
    assertAlive();
    await chrome.storage.local.set({ [key]: value });
  },
};

export function memoryKv(initial: Record<string, unknown> = {}): KeyValue {
  const data = new Map(Object.entries(initial));
  return {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    set: async (key, value) => {
      data.set(key, structuredClone(value));
    },
  };
}

/** the keys of one profile: `settings` is stored as `settings:de20:12345` */
export function profileKv(kv: KeyValue, profile: Profile): KeyValue {
  return {
    get: <T>(key: string) => kv.get<T>(profileStorageKey(key, profile)),
    set: (key, value) => kv.set(profileStorageKey(key, profile), value),
  };
}
