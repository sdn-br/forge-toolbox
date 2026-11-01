// The order of the plunderable buildings of a city: the loot that is worth more comes first.
import { FORGE_POINTS } from '../../shared/resources';
import type { Plunderable } from './assess-city';

const MINOR = new Set(['money', 'supplies']);

/** Forge points, the other loot besides coins and supplies, and coins plus supplies. */
function lootWeights(resources: Record<string, number>) {
  let fp = 0;
  let other = 0;
  let minor = 0;
  for (const [id, amount] of Object.entries(resources)) {
    if (id === FORGE_POINTS) fp += amount;
    else if (MINOR.has(id)) minor += amount;
    else other += amount;
  }
  return { fp, other, minor, important: fp + other > 0 };
}

type Weighted = { plunderable: Plunderable; weights: ReturnType<typeof lootWeights> };

/**
 * Important plunders first, then Forge points, the other loot and coins plus supplies, each descending, then the name.
 * Compared in that order, so 4 FP beat 500 goods and 500 goods beat 20,000 coins.
 */
function byPlunderPriority(a: Weighted, b: Weighted): number {
  const [wa, wb] = [a.weights, b.weights];
  return (
    Number(wb.important) - Number(wa.important) ||
    wb.fp - wa.fp ||
    wb.other - wa.other ||
    wb.minor - wa.minor ||
    a.plunderable.name.localeCompare(b.plunderable.name, 'de')
  );
}

/** the plunderable buildings in priority order, each with whether its loot is more than coins and supplies */
export const sortByPlunderPriority = (
  plunderables: Plunderable[],
): { plunderable: Plunderable; important: boolean }[] =>
  plunderables
    .map((plunderable): Weighted => ({ plunderable, weights: lootWeights(plunderable.resources) }))
    .sort(byPlunderPriority)
    .map(({ plunderable, weights }) => ({ plunderable, important: weights.important }));
