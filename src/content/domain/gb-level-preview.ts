// A later level of a great building as if it were open and empty: what it costs and what each place pays. Pure, so
// the own great buildings can use it too (Eigenanteilsrechner).
import { roundHalfUp } from '../../shared/math';
import type { GreatBuildingDef, TierStart } from '../model/catalog';
import type { RankingRow } from '../model/great-building';
import { type ConstructionCalc, calculateConstruction, constructionOf } from './gb-calculator';
import type { LevelCost } from './gb-level-cost';
import { levelTier, tierPlaces } from './gb-tier';

/**
 * The share of the cost all places get together, in percent, by the level the construction goes to: up to `upTo` the
 * share. Seen 2026-11-05 on recorded levels after the prestige update.
 */
// debt: only 15 % (101 to 200), 25 % (70 to 100) and 40 % (40 to 69, Galataturm 64 to 65) are checked against levels
// seen in the game, the other shares follow the rule as the FoE Helfer 4.8.7.0 states it. ceiling: the shares of levels
// up to 39 and from 201 on are unverified.
// upgrade: when a recorded level of such a range contradicts.
const POOL_SHARES: readonly { upTo: number; share: number }[] = [
  { upTo: 9, share: 25 },
  { upTo: 39, share: 30 },
  { upTo: 69, share: 40 },
  { upTo: 100, share: 25 },
  { upTo: 200, share: 15 },
  { upTo: 300, share: 10 },
  { upTo: 400, share: 7 },
];
const POOL_SHARE_ABOVE = 5;

/** the share of the cost all places of a construction to `target` get together, in percent */
export const poolShare = (target: number): number =>
  POOL_SHARES.find((s) => target <= s.upTo)?.share ?? POOL_SHARE_ABOVE;

/**
 * The Forge point rewards of places 1 to `places` of a construction to `target` that costs `cost`. The pool is the cost
 * times the share of `target`; place n gets the weight 1/n! of it, each place rounded from the pool on its own (halves
 * up). The game pays 2 for a 1 and 4 for a 3.
 */
export function placeRewards(cost: number, target: number, places: number): number[] {
  const pool = (cost * poolShare(target)) / 100;
  // places! / n!, whole numbers: 7 places weigh 5040, 2520, 840, 210, 42, 7, 1
  const weights: number[] = [];
  for (let n = places, w = 1; n >= 1; w *= n, n--) weights.unshift(w);
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => {
    const fp = roundHalfUp((pool * w) / sum);
    return fp === 1 || fp === 3 ? fp + 1 : fp;
  });
}

interface LevelPreviewInput {
  greatBuilding: GreatBuildingDef;
  /** the level the construction starts from */
  level: number;
  /** the cost of the level; undefined when it is not known */
  cost: LevelCost | undefined;
  /** the Arc bonus of the tier of level + 1 */
  arcBonus: number;
  factor: number;
  /** the tiers of great building levels; the default ones when missing */
  tiers?: TierStart[];
}

/** A level as it opens: its cost and the places with nobody on them, 5 on a copper level, 7 on a gold one. */
interface EmptyLevel {
  level: number;
  /** Forge points the level needs; undefined when the cost is not known */
  required?: number;
  /** the cost is computed from the costs seen, so it and the rewards are estimated */
  estimate: boolean;
  /** the places without deposits; undefined without a cost */
  rankings?: RankingRow[];
}

export interface LevelPreview extends Omit<EmptyLevel, 'rankings'> {
  /** the places of the empty level; undefined without a cost */
  calc?: ConstructionCalc;
}

/**
 * The level as if it were open and nobody had paid yet: blueprints and medals are not known, they stay 0. `cost` is
 * the cost of the level, seen or computed (see gb-level-cost.ts); without it there are no places.
 */
export function emptyLevel(
  greatBuilding: GreatBuildingDef,
  level: number,
  cost: LevelCost | undefined,
  tiers?: TierStart[],
): EmptyLevel {
  if (cost === undefined) return { level, estimate: false };
  const { fp: required, estimate } = cost;
  const places = tierPlaces(levelTier(greatBuilding, level + 1, tiers));
  const rankings: RankingRow[] = placeRewards(required, level + 1, places).map((fp, i) => ({
    rank: i + 1,
    name: '',
    self: false,
    reward: { fp, blueprints: 0, medals: 0 },
  }));
  return { level, required, estimate, rankings };
}

/** The level as if it were open and nobody had paid yet, priced like a foreign construction. */
export function previewLevel(input: LevelPreviewInput): LevelPreview {
  const { greatBuilding, level, cost, arcBonus, factor, tiers } = input;
  const { required, estimate, rankings } = emptyLevel(greatBuilding, level, cost, tiers);
  if (required === undefined || !rankings) return { level, required, estimate };
  const calc = calculateConstruction(constructionOf({ level, required }, rankings, { arcBonus, factor }));
  return { level, required, estimate, calc };
}
