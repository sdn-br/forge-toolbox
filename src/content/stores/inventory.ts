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

/** The inventory of the player as the game reported it at the start. Nothing is persisted, every start sends it. */
export class InventoryStore {
  private list?: InventoryItem[];

  constructor(private bus: ToolboxBus) {}

  /** false until the game sent the inventory */
  get known(): boolean {
    return this.list !== undefined;
  }

  items(): InventoryItem[] {
    return this.list ?? [];
  }

  item(id: number): InventoryItem | undefined {
    return this.list?.find((i) => i.id === id);
  }

  set(items: InventoryItem[]): void {
    this.list = [...items];
    this.bus.emit('inventory.changed', {});
  }

  /** Forge points in all Forge point packages: stock times gain of each */
  forgePointPackages(): number {
    let sum = 0;
    for (const i of this.items()) if (i.payload.kind === 'forgePoints') sum += i.inStock * i.payload.gain;
    return sum;
  }
}
