// What the inventory holds, worked out from its items.
import type { InventoryItem } from '../../shared/model';

/** Forge points in all Forge point packages: stock times gain of each package */
export function forgePointPackagesOf(items: InventoryItem[]): number {
  let sum = 0;
  for (const i of items) if (i.payload.kind === 'forgePoints') sum += i.inStock * i.payload.gain;
  return sum;
}
