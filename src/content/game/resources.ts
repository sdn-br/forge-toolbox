// Game format → own model for resources and inventory: resource bag, trades, items, package Forge points, limited bonuses. Nothing outside src/content/game sees the game format.

import { buildingDefId } from '../../shared/ids';
import type { InventoryItem, ItemPayload } from '../../shared/model';
import type { Ingestion } from '../core/ingestion';
import type { LimitedBonus } from '../model/bonus';
import type { GameHandlerDeps } from './deps';
import type { GameEvent, GameInventoryItem, GameLimitedBonus } from './game-types';
import { list, num, numbersOrNull } from './json';

/** The resource bag of the player, `{ resources: { resources: { money: … } } }` (seen 2026-10-21); null when it is not one. */
export function toResourceBag(data: unknown): Record<string, number> | null {
  const bag = data as { type?: { value?: unknown }; resources?: { resources?: unknown } } | null;
  // other bag types (seen only PlayerMain) belong to other stocks, not the player's
  const type = bag?.type?.value;
  if (type !== undefined && type !== 'PlayerMain') return null;
  return numbersOrNull(bag?.resources?.resources);
}

/** ResourceService.getPlayerResources (not recorded yet): `{ resources: { money, strategy_points, … } }`, the full stock */
export function toPlayerResources(data: unknown): Record<string, number> | null {
  return numbersOrNull((data as { resources?: unknown } | null)?.resources);
}

/** The game's own sum of Forge points in packages: `[108198]`. */
export const toPackageForgePoints = (data: unknown): number | undefined =>
  num(Array.isArray(data) ? data[0] : undefined);

/** The active limited bonuses; `isActive: false` ones are dropped. */
export function toLimitedBonuses(data: unknown): LimitedBonus[] {
  return list<GameLimitedBonus | null>(data).flatMap((b) => {
    const value = num(b?.value);
    if (!b?.type || value === undefined || b.isActive === false) return [];
    const entityId = num(b.entityId);
    return [{ type: b.type, value, ...(entityId !== undefined && { entityId }) }];
  });
}

function toItemPayload(p: GameInventoryItem['item']): ItemPayload {
  const other = { kind: 'other', gameClass: p?.__class__ ?? 'missing' } as const;
  switch (p?.__class__) {
    case 'ForgePointPackagePayload': {
      const gain = num(p.resource_package?.gain);
      return gain === undefined ? other : { kind: 'forgePoints', gain };
    }
    case 'BuildingItemPayload': {
      if (!p.cityEntityId) return other;
      const level = num(p.level);
      return { kind: 'building', def: buildingDefId(p.cityEntityId), ...(level !== undefined && { level }) };
    }
    case 'BoostItemPayload': {
      const value = num(p.value);
      if (!p.boostType || value === undefined) return other;
      const duration = num(p.duration);
      return { kind: 'boost', boostType: p.boostType, value, ...(duration !== undefined && { duration }) };
    }
    default:
      return other;
  }
}

/** One full item (InventoryService.getItem); null when it has no id. */
export function toInventoryItem(data: unknown): InventoryItem | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return toInventory([data])?.[0] ?? null;
}

/** `[id, amount]` of InventoryService.getItemAmount (not recorded yet) */
export function toItemAmount(data: unknown): { id: number; inStock: number } | null {
  if (!Array.isArray(data)) return null;
  const [id, inStock] = data.map(num);
  return id === undefined || inStock === undefined ? null : { id, inStock };
}

/**
 * InventoryService.updateItem (recorded 2026-10-21 and 2026-10-23): one `{ id, amount, receivedAt? }` per entry,
 * `amount` the new stock, not a difference. A contribution brings two per package item in one batch: the packages
 * used, then the reward with `receivedAt`; the last one counts. A list of them is read as well.
 */
export function toItemUpdates(data: unknown): { id: number; inStock: number }[] {
  return (Array.isArray(data) ? data : [data]).flatMap((u: { id?: unknown; amount?: unknown } | null) => {
    const id = num(u?.id);
    const inStock = num(u?.amount);
    return id === undefined || inStock === undefined ? [] : [{ id, inStock }];
  });
}

/** The items of InventoryService.getItems; null when `data` is no list. Items without id are skipped. */
export function toInventory(data: unknown): InventoryItem[] | null {
  if (!Array.isArray(data)) return null;
  return (data as (GameInventoryItem | null)[]).flatMap((i) => {
    const id = num(i?.id);
    if (!i || id === undefined) return [];
    return [
      {
        id,
        name: i.name ?? '',
        inStock: num(i.inStock) ?? 0,
        ...(i.itemAssetName && { asset: i.itemAssetName }),
        payload: toItemPayload(i.item),
      },
    ];
  });
}

/**
 * Another player accepted a trade offer of the session player (`newEvent` of type trade_accepted, not recorded yet):
 * the player gets the good he asked for.
 */
export function toAcceptedTrade(e: GameEvent | null): { good: string; amount: number } | null {
  const amount = num(e?.need?.value);
  if (e?.type !== 'trade_accepted' || !e.need?.good_id || amount === undefined) return null;
  return { good: e.need.good_id, amount };
}

/** Registers the resources and inventory handlers. */
export function registerResources(ingestion: Ingestion, deps: GameHandlerDeps): void {
  const { resources, playerBonuses, inventory } = deps;

  // The resource bag comes with the startup data: `{ type: PlayerMain, resources: { resources: { … } } }` (seen
  // 2026-10-21); other bag types are skipped. Not recorded yet: getPlayerResources `{ resources: { … } }` with the full
  // stock, as a response or over the websocket.
  ingestion.on('ResourceService', 'getPlayerResourceBag', ({ data }) => {
    const bag = toResourceBag(data);
    if (bag) resources.set(bag);
  });
  ingestion.on('ResourceService', 'getPlayerResources', ({ data }) => {
    const bag = toPlayerResources(data);
    if (bag) resources.set(bag);
  });
  // not recorded yet: an accepted own trade offer brings the good asked for
  ingestion.on('OtherPlayerService', 'newEvent', ({ data }) => {
    const trade = toAcceptedTrade(data as GameEvent);
    if (trade) resources.add(trade.good, trade.amount);
  });

  // The full list comes with the startup data (seen 2026-10-21, 298 items) and replaces the inventory. updateItem
  // `{ id, amount, receivedAt? }` with the new stock is recorded (see toItemUpdates). Not recorded yet, shapes as
  // described: getItemsByType brings the full items of one type, getItem one full item (new ones arrive so, e.g.
  // rewards), getItemAmount `[id, amount]`. All may come as a response or over the websocket; listeners hear once per
  // response.
  ingestion.on('InventoryService', 'getItems', ({ data }) => {
    const items = toInventory(data);
    if (items) inventory.replace(items);
  });
  ingestion.on('InventoryService', 'getItemsByType', ({ data }) => {
    inventory.upsert(toInventory(data) ?? []);
  });
  ingestion.on('InventoryService', 'getItem', ({ data }) => {
    const item = toInventoryItem(data);
    if (item) inventory.upsert([item]);
  });
  ingestion.on('InventoryService', 'getItemAmount', ({ data }) => {
    const amount = toItemAmount(data);
    if (amount) inventory.setStock(amount.id, amount.inStock);
  });
  ingestion.on('InventoryService', 'updateItem', ({ data }) => {
    for (const u of toItemUpdates(data)) inventory.setStock(u.id, u.inStock);
  });
  // the game's own sum of Forge points in packages (seen 2026-10-21 after a contribution: `[108198]`)
  ingestion.on('GreatBuildingsService', 'getAvailablePackageForgePoints', ({ data }) => {
    const fp = toPackageForgePoints(data);
    if (fp !== undefined) inventory.reportPackageForgePoints(fp);
  });
  ingestion.onBatchEnd(() => inventory.commit());
  ingestion.on('BonusService', 'getLimitedBonuses', ({ data }) => {
    playerBonuses.setLimited(toLimitedBonuses(data));
  });
}
