import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { toInventory } from '../src/content/game/convert';
import { registerGameHandlers } from '../src/content/game/handlers';
import fixture from './fixtures/great-buildings.json';
import { testStores } from './helpers/stores';

function setup() {
  const ingestion = new Ingestion();
  const { world, bus, now, stores } = testStores();
  registerGameHandlers(ingestion, { world, bus, now, ...stores });
  const events: string[] = [];
  bus.on('inventory.changed', () => events.push('inventory'));
  const send = (data: unknown) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: null,
      response: JSON.stringify([{ requestClass: 'InventoryService', requestMethod: 'getItems', responseData: data }]),
      at: 0,
    });
  return { inventory: stores.inventory, events, send };
}

describe('inventory', () => {
  it('keeps every item and sums the Forge point packages of the recorded inventory', () => {
    const { inventory, events, send } = setup();
    expect(inventory.known).toBe(false);
    expect(inventory.forgePointPackages()).toBe(0);
    send(fixture.inventory[0]?.responseData);
    expect(events).toEqual(['inventory']);
    expect(inventory.items()).toHaveLength(4);
    expect(inventory.item(9001)).toEqual({
      id: 9001,
      name: '10 Forge-Punkte',
      inStock: 9931,
      gameClass: 'ForgePointPackagePayload',
      asset: 'large_forgepoints',
      payload: { kind: 'forgePoints', gain: 10 },
    });
    expect(inventory.item(9004)?.payload).toEqual({
      kind: 'boost',
      boostType: 'att_boost_attacker',
      value: 20,
      duration: 28800,
    });
    // 9931 × 10 + 401 × 5 + 3569 × 2
    expect(inventory.forgePointPackages()).toBe(108_453);
  });

  it('reads buildings, keeps unknown kinds as other and skips items without id', () => {
    expect(
      toInventory([
        { id: 1, name: 'B', inStock: 2, item: { __class__: 'BuildingItemPayload', cityEntityId: 'W_X', level: 3 } },
        { id: 2, name: 'K', inStock: 5, item: { __class__: 'SelfAidKitPayload' } },
        { id: 3, item: { __class__: 'ForgePointPackagePayload' } },
        { name: 'no id', inStock: 1 },
      ]),
    ).toEqual([
      {
        id: 1,
        name: 'B',
        inStock: 2,
        gameClass: 'BuildingItemPayload',
        payload: { kind: 'building', def: 'W_X', level: 3 },
      },
      { id: 2, name: 'K', inStock: 5, gameClass: 'SelfAidKitPayload', payload: { kind: 'other' } },
      { id: 3, name: '', inStock: 0, gameClass: 'ForgePointPackagePayload', payload: { kind: 'other' } },
    ]);
    expect(toInventory({})).toBeNull();
  });
});
