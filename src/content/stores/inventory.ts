import type { BuildingDefId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';

/**
 * What an item does, as far as a feature reads it. The game names the kind by the payload class; kinds no feature
 * reads yet are `other` and keep only that class.
 */
export type ItemPayload =
  | { kind: 'forgePoints'; gain: number }
  | { kind: 'building'; def: BuildingDefId; level?: number }
  | { kind: 'boost'; boostType: string; value: number; duration?: number }
  | { kind: 'other' };

export interface InventoryItem {
  /** the game's id of this stack in the inventory */
  id: number;
  name: string;
  inStock: number;
  /** payload class of the game, e.g. `ForgePointPackagePayload` */
  gameClass: string;
  /** picture of the item in the game's assets */
  asset?: string;
  payload: ItemPayload;
}

/**
 * The inventory of the player: the full list from the start, kept current by the updates the game sends. Nothing is
 * persisted, every start sends it. Changes are collected and announced once per game response (`commit`), because
 * opening packages sends several updates in a row.
 */
export class InventoryStore {
  private byId?: Map<number, InventoryItem>;
  private dirty = false;

  constructor(private bus: ToolboxBus) {}

  /** false until the game sent the inventory */
  get known(): boolean {
    return this.byId !== undefined;
  }

  items(): InventoryItem[] {
    return [...(this.byId?.values() ?? [])];
  }

  item(id: number): InventoryItem | undefined {
    return this.byId?.get(id);
  }

  /** the full list replaces the inventory and announces it at once */
  set(items: InventoryItem[]): void {
    this.replace(items);
    this.commit();
  }

  /** the full list replaces the inventory; announced with the next `commit` */
  replace(items: InventoryItem[]): void {
    this.byId = new Map(items.map((i) => [i.id, i]));
    this.dirty = true;
  }

  /** adds or replaces these items and leaves all others; announced with the next `commit` */
  upsert(items: InventoryItem[]): void {
    if (items.length === 0) return;
    this.byId ??= new Map();
    for (const i of items) this.byId.set(i.id, i);
    this.dirty = true;
  }

  /** the new stock of a known item; an unknown one waits for the next full list. Announced with the next `commit`. */
  setStock(id: number, inStock: number): void {
    const item = this.byId?.get(id);
    if (!item || item.inStock === inStock) return;
    this.byId?.set(id, { ...item, inStock });
    this.dirty = true;
  }

  /** announces the changes since the last commit, if there were any */
  commit(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.bus.emit('inventory.changed', {});
  }

  /** Forge points in all Forge point packages: stock times gain of each */
  forgePointPackages(): number {
    let sum = 0;
    for (const i of this.items()) if (i.payload.kind === 'forgePoints') sum += i.inStock * i.payload.gain;
    return sum;
  }
}
