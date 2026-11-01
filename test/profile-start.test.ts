import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/content/core/events';
import { memoryKv, profileKv } from '../src/content/core/kv';
import { backgroundCall } from '../src/content/core/rpc';
import { Settings, toggleDef } from '../src/content/core/settings';
import { startupGate } from '../src/content/core/startup-gate';
import { identifyStartup } from '../src/content/game/identify';
import { createStores } from '../src/content/stores';
import { UiState } from '../src/content/ui/ui-state';
import { playerId, worldId } from '../src/shared/ids';
import type { Profile } from '../src/shared/profile';
import type { Traffic } from '../src/shared/proxy-protocol';

const de20 = worldId('de20');
const profile: Profile = { world: de20, player: playerId(12345) };

const json = (tag: string, entries: unknown[] = []): Traffic => ({
  kind: 'json',
  url: `x/game/json?${tag}`,
  request: null,
  response: JSON.stringify(entries),
  at: 0,
});
const startup = (player: number) =>
  json('startup', [
    { requestClass: 'TimeService', requestMethod: 'updateTime', responseData: {} },
    {
      requestClass: 'StartupService',
      requestMethod: 'getData',
      responseData: { user_data: { player_id: player, user_name: 'Me' } },
    },
  ]);
const tagOf = (t: Traffic) => (t.kind === 'json' ? t.url.split('?')[1] : '');

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('startup gate', () => {
  it('holds the traffic until the profile has loaded, then lets it through in order and continues live', async () => {
    const seen: string[] = [];
    const loaded = deferred<(t: Traffic) => void>();
    const start = vi.fn((_: Profile, _name: string) => loaded.promise);
    const gate = startupGate(identifyStartup(de20), start);

    gate.receive(json('meta'));
    gate.receive(startup(12345));
    expect(start).toHaveBeenCalledWith(profile, 'Me');
    gate.receive(json('while-loading'));
    expect(seen).toEqual([]);

    loaded.resolve((t) => seen.push(tagOf(t) ?? ''));
    await gate.started;
    expect(seen).toEqual(['meta', 'startup', 'while-loading']);

    gate.receive(json('live'));
    expect(seen).toEqual(['meta', 'startup', 'while-loading', 'live']);
  });

  it('starts once, and not before startup data with a player id', async () => {
    const start = vi.fn(async () => () => {});
    const gate = startupGate(identifyStartup(de20), start);
    gate.receive(json('other', [{ requestClass: 'StartupService', requestMethod: 'getData', responseData: {} }]));
    expect(start).not.toHaveBeenCalled();
    gate.receive(startup(1));
    gate.receive(startup(1));
    await gate.started;
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('profile keys', () => {
  it('lets settings and box state read and write the keys of the profile', async () => {
    const kv = memoryKv({ settings: { a: false }, 'settings:de20:12345': { a: true }, 'ui.boxes:de20:12345': {} });
    const own = profileKv(kv, profile);
    const settings = new Settings(own);
    const a = settings.register(
      toggleDef({ key: 'a', group: 'settings.core', label: 'settings.recordTraffic', default: false }),
    );
    const ui = new UiState(own);
    await Promise.all([settings.load(), ui.load()]);
    expect(a.get()).toBe(true);

    await a.set(false);
    ui.saveBox('pvp', { x: 5 });
    ui.savePref('map', 'grid');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await kv.get('settings:de20:12345')).toEqual({ a: false });
    expect(await kv.get('ui.boxes:de20:12345')).toEqual({ pvp: { x: 5 } });
    expect(await kv.get('ui.prefs:de20:12345')).toEqual({ map: 'grid' });
    expect(await kv.get('settings')).toEqual({ a: false });
    expect(await kv.get('ui.boxes')).toBeUndefined();
  });
});

describe('background call', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names the profile in every call the stores make', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, result: { groups: [], pages: [] } }));
    vi.stubGlobal('chrome', { runtime: { id: 'x', sendMessage } });
    const stores = createStores(
      de20,
      createBus(),
      backgroundCall(profile),
      { prefs: new UiState(memoryKv()), settings: new Settings(memoryKv()) },
      () => 1000,
    );

    await stores.notes.load();

    expect(sendMessage).toHaveBeenCalledWith({ profile, rpc: 'notes.load', arg: { world: de20 } });
  });

  it('turns an error answer into a rejection', async () => {
    vi.stubGlobal('chrome', { runtime: { id: 'x', sendMessage: async () => ({ ok: false, error: 'nope' }) } });
    await expect(backgroundCall(profile)('battles.summary', { world: de20 })).rejects.toThrow('nope');
  });
});
