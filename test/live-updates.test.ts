import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { registerGameHandlers } from '../src/content/game/handlers';
import { testStores } from './helpers/stores';

type Message = [service: string, method: string, data: unknown];

function setup() {
  const ingestion = new Ingestion();
  const { world, bus, now, stores } = testStores();
  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  const events: string[] = [];
  bus.on('inventory.changed', () => events.push('inventory'));
  bus.on('resources.changed', () => events.push('resources'));
  const entries = (messages: Message[]) =>
    JSON.stringify(
      messages.map(([requestClass, requestMethod, responseData]) => ({ requestClass, requestMethod, responseData })),
    );
  return {
    ...stores,
    events,
    json: (...messages: Message[]) =>
      ingestion.accept({ kind: 'json', url: '/game/json?h=1', request: null, response: entries(messages), at: 0 }),
    /** one websocket frame; it may bundle several messages */
    ws: (...messages: Message[]) => ingestion.accept({ kind: 'ws', data: entries(messages), at: 0 }),
  };
}

const fpPack = (id: number, inStock: number, gain: number) => ({
  id,
  name: `${gain} Forge-Punkte`,
  inStock,
  item: { resource_package: { gain }, __class__: 'ForgePointPackagePayload' },
});
const kit = (id: number, inStock: number) => ({ id, name: 'Kit', inStock, item: { __class__: 'SelfAidKitPayload' } });

const INV = 'InventoryService';

describe('inventory updates (assumed formats, not recorded)', () => {
  it('replaces the whole inventory with getItems and announces it once per response', () => {
    const s = setup();
    s.json([INV, 'getItems', [fpPack(1, 10, 10), kit(2, 5)]]);
    s.ws([INV, 'getItems', [fpPack(1, 3, 10)]]);
    expect(s.inventory.items().map((i) => i.id)).toEqual([1]);
    expect(s.inventory.forgePointPackages()).toBe(30);
    expect(s.events).toEqual(['inventory', 'inventory']);
  });

  it('getItemsByType adds and replaces the items of that type and keeps all others', () => {
    for (const via of ['json', 'ws'] as const) {
      const s = setup();
      s.json([INV, 'getItems', [fpPack(1, 10, 10), kit(2, 5)]]);
      s[via]([INV, 'getItemsByType', [fpPack(1, 12, 10), fpPack(3, 4, 5)]]);
      expect(s.inventory.items().map((i) => [i.id, i.inStock])).toEqual([
        [1, 12],
        [2, 5],
        [3, 4],
      ]);
      expect(s.inventory.forgePointPackages()).toBe(140);
    }
  });

  it('getItem brings a new item, also before the full list', () => {
    const s = setup();
    s.ws([INV, 'getItem', fpPack(7, 2, 2)]);
    expect(s.inventory.item(7)?.inStock).toBe(2);
    s.json([INV, 'getItems', [kit(2, 5)]]);
    s.json([INV, 'getItem', fpPack(8, 1, 10)]);
    expect(s.inventory.forgePointPackages()).toBe(10);
    expect(s.events).toEqual(['inventory', 'inventory', 'inventory']);
  });

  it('getItemAmount and updateItem set the new stock of known items and ignore unknown ones', () => {
    for (const via of ['json', 'ws'] as const) {
      const s = setup();
      s.json([INV, 'getItems', [fpPack(1, 10, 10), fpPack(2, 10, 2)]]);
      s.events.length = 0;
      s[via]([INV, 'getItemAmount', [1, 8]]);
      expect(s.inventory.item(1)?.inStock).toBe(8);
      s[via]([INV, 'updateItem', { id: 2, amount: 7, __class__: 'InventoryItemUpdate' }]);
      expect(s.inventory.item(2)?.inStock).toBe(7);
      s[via]([
        INV,
        'updateItem',
        [
          { id: 1, amount: 0 },
          { id: 99, amount: 5 },
        ],
      ]);
      s[via]([INV, 'getItemAmount', [98, 3]]);
      s[via]([INV, 'updateItem', { id: 99, amount: 1 }]);
      expect(s.inventory.items().map((i) => [i.id, i.inStock])).toEqual([
        [1, 0],
        [2, 7],
      ]);
      // the unknown ids changed nothing, so their messages stay quiet
      expect(s.events).toEqual(['inventory', 'inventory', 'inventory']);
    }
  });

  it('announces a frame with several updates once', () => {
    const s = setup();
    s.json([INV, 'getItems', [fpPack(1, 10, 10), fpPack(2, 10, 5)]]);
    s.events.length = 0;
    s.ws(
      [INV, 'updateItem', { id: 1, amount: 9 }],
      [INV, 'updateItem', { id: 1, amount: 8 }],
      [INV, 'getItemAmount', [2, 1]],
    );
    expect(s.inventory.forgePointPackages()).toBe(85);
    expect(s.events).toEqual(['inventory']);
  });
});

describe('resource updates', () => {
  const bag = (resources: object, type?: string) => ({
    ...(type && { type: { __enum__: 'ResourceBagType', value: type } }),
    resources: { resources },
  });

  it('takes the resource bag of the player and skips other bag types', () => {
    const s = setup();
    s.json(['ResourceService', 'getPlayerResourceBag', bag({ strategy_points: 5 }, 'PlayerMain')]);
    s.ws(['ResourceService', 'getPlayerResourceBag', bag({ strategy_points: 9 }, 'GuildTreasury')]);
    expect(s.resources.amount('strategy_points')).toBe(5);
    s.ws(['ResourceService', 'getPlayerResourceBag', bag({ strategy_points: 7 })]);
    expect(s.resources.amount('strategy_points')).toBe(7);
    expect(s.events).toEqual(['resources', 'resources']);
  });

  it('getPlayerResources replaces the whole stock (assumed format)', () => {
    for (const via of ['json', 'ws'] as const) {
      const s = setup();
      s.json(['ResourceService', 'getPlayerResourceBag', bag({ strategy_points: 5, money: 100 }, 'PlayerMain')]);
      s[via](['ResourceService', 'getPlayerResources', { resources: { strategy_points: 12 } }]);
      expect(s.resources.amount('strategy_points')).toBe(12);
      expect(s.resources.amount('money')).toBe(0);
    }
  });

  it('adds the good of an accepted trade offer to a known stock (assumed format)', () => {
    const s = setup();
    const trade = { type: 'trade_accepted', need: { good_id: 'marble', value: 150 } };
    s.ws(['OtherPlayerService', 'newEvent', trade]);
    expect(s.resources.known).toBe(false);
    s.json(['ResourceService', 'getPlayerResourceBag', bag({ marble: 50 }, 'PlayerMain')]);
    s.ws(['OtherPlayerService', 'newEvent', trade]);
    expect(s.resources.amount('marble')).toBe(200);
  });
});
