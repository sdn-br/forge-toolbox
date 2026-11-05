// The factor of the great building calculators: 90 % reads as the factor 1,9 helpers know. What was picked, what is in
// effect with the own Arc bonus, and the way between percent and factor. A fixed factor is kept per tier of the level
// (copper or gold), the choice of the Arc bonus for both.
import type { GreatBuildingTier } from '../model/catalog';

/**
 * the factor picked: a number in percent, or the own Arc bonus, which follows the bonus when it changes. `value` is
 * the fixed factor on copper levels, `gold` the one on gold levels, where the Arc bonus is far smaller.
 */
export interface FactorChoice {
  value: number;
  arc: boolean;
  /** missing in choices from before 2026-11-05: the default gold factor */
  gold?: number;
}

/** the fixed factor on gold levels while none is chosen, 1,15 */
export const GOLD_FACTOR = 15;

/** the fixed factor of a choice on a level of `tier` */
export const fixedFactor = (choice: FactorChoice, tier: GreatBuildingTier = 'copper') =>
  tier === 'gold' ? (choice.gold ?? GOLD_FACTOR) : choice.value;

/** the choice with a fixed factor for levels of `tier`; the fixed factor of the other tier stays */
export const withFixed = (choice: FactorChoice, value: number, tier: GreatBuildingTier = 'copper'): FactorChoice =>
  tier === 'gold' ? { ...choice, gold: value, arc: false } : { ...choice, value, arc: false };

/** 90 % is the factor 1,9 helpers know */
export const factorOf = (percent: number) => (100 + percent) / 100;

/** a factor as typed, 1,955, back to percent with one decimal, 95.5 */
export const percentOf = (factor: number) => Math.round((factor - 1) * 1000) / 10;

/** what the arrows of a factor field add: 1,9 → 1,91; typing still takes 1,955 */
export const FACTOR_STEP = 0.01;

/** the factor in effect on a level of `tier`: the Arc bonus of that tier only while its button shows */
export const effectiveFactor = (choice: FactorChoice, arcBonus: number | undefined, tier?: GreatBuildingTier) =>
  choice.arc && arcBonus !== undefined ? arcBonus : fixedFactor(choice, tier);

/** the factor of each place, one choice per place */
export const effectiveFactors = (choices: FactorChoice[], arcBonus: number | undefined, tier?: GreatBuildingTier) =>
  choices.map((c) => effectiveFactor(c, arcBonus, tier));
