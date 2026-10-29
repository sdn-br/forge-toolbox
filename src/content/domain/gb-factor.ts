// The factor of the great building calculators: 90 % reads as the factor 1,9 helpers know. What was picked, what is in
// effect with the own Arc bonus, and the way between percent and factor.

/** the factor picked: a number in percent, or the own Arc bonus, which follows the bonus when it changes */
export interface FactorChoice {
  value: number;
  arc: boolean;
}

/** 90 % is the factor 1,9 helpers know */
export const factorOf = (percent: number) => (100 + percent) / 100;

/** a factor as typed, 1,955, back to percent with one decimal, 95.5 */
export const percentOf = (factor: number) => Math.round((factor - 1) * 1000) / 10;

/** what the arrows of a factor field add: 1,9 → 1,91; typing still takes 1,955 */
export const FACTOR_STEP = 0.01;

/** the factor in effect: the Arc bonus only while its button shows */
export const effectiveFactor = (choice: FactorChoice, arcBonus: number | undefined) =>
  choice.arc && arcBonus !== undefined ? arcBonus : choice.value;

/** the factor of each place, one choice per place */
export const effectiveFactors = (choices: FactorChoice[], arcBonus: number | undefined) =>
  choices.map((c) => effectiveFactor(c, arcBonus));
