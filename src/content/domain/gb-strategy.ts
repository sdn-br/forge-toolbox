// Strategies on the running construction of a foreign great building: ways to pay in that the places alone do not show.
import type { GreatBuildingDef } from '../stores/catalog';
import { type ConstructionCalc, type ConstructionInput, plusPercent } from './gb-calculator';
import { previewLevel } from './gb-level-preview';

/** Level the building now with everything still missing, then take place 1 of the next level while it is empty. */
export interface LevelUpAndFirst {
  /** the level the next construction starts from */
  nextLevel: number;
  /** what the player pays to level now: everything still missing */
  fill: number;
  /** the place the own total ends on, others with the same deposit stay ahead */
  rank: number;
  /** gross reward of that place (0 without one) minus the own total */
  fillGain: number;
  /** the safe cost of place 1 of the empty next level */
  firstCost: number;
  /** gross reward of that place 1 minus its safe cost */
  firstGain: number;
  total: number;
}

/**
 * The combination only when the next level can be paid into right after the level up and it pays: not blocked, the
 * level after the next construction start unlocked, the reward of the next level known and the total above the best
 * profit of the current level without levelling: the own place, or a place still to take (0 when none brings one).
 * `calc` is the construction of `input`, as the caller has it already.
 */
export function levelUpAndFirst(
  input: ConstructionInput,
  calc: ConstructionCalc,
  greatBuilding: GreatBuildingDef | undefined,
): LevelUpAndFirst | undefined {
  const { level, maxLevel, rankings, arcBonus } = input;
  // the construction from `level` is open while level < maxLevel, so the next one needs level + 1 < maxLevel
  if (!greatBuilding || !input.connected || level + 1 >= maxLevel) return undefined;
  const fill = calc.missing;
  if (fill <= 0) return undefined;
  const mine = calc.myDeposit + fill;
  const others = rankings.filter((r) => r.rank !== undefined && !r.self).map((r) => r.fp ?? 0);
  const rank = 1 + others.filter((fp) => fp >= mine).length;
  const reward = rankings.find((r) => r.rank === rank)?.reward?.fp ?? 0;
  const fillGain = plusPercent(reward, arcBonus) - mine;
  const first = previewLevel({ greatBuilding, level: level + 1, arcBonus, factor: input.factor }).calc?.places[0];
  if (first?.safeCost === undefined || first.profit === undefined) return undefined;
  const total = fillGain + first.profit;
  // levelling up plus first place against what the current level pays without levelling: the own place as it stands,
  // or a place still to take that does not complete the level; completing the level is this case itself
  const best = Math.max(
    0,
    ...calc.places.filter((p) => p.mine || (p.available && !p.levelWarning)).map((p) => p.profit ?? 0),
  );
  if (total <= best) return undefined;
  return { nextLevel: level + 1, fill, rank, fillGain, firstCost: first.safeCost, firstGain: first.profit, total };
}
