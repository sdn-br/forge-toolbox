import { describe, expect, it } from 'vitest';
import { forgePointPackagesOf } from '../src/content/domain/inventory';
import type { InventoryItem } from '../src/shared/model';

const item = (id: number, inStock: number, payload: InventoryItem['payload']): InventoryItem => ({
  id,
  name: `I${id}`,
  inStock,
  gameClass: 'X',
  payload,
});

describe('forgePointPackagesOf', () => {
  it('sums stock times gain of the Forge point packages only', () => {
    expect(
      forgePointPackagesOf([
        item(1, 3, { kind: 'forgePoints', gain: 10 }),
        item(2, 2, { kind: 'forgePoints', gain: 5 }),
        item(3, 9, { kind: 'other' }),
      ]),
    ).toBe(40);
    expect(forgePointPackagesOf([])).toBe(0);
  });
});
