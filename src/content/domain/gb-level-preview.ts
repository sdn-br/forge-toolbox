// A later level of a great building as if it were open and empty: what it costs and what each place pays. Pure, so
// the own great buildings can use it too (Eigenanteilsrechner).
import { EPSILON, roundHalfUp } from '../../shared/math';
import table from '../data/gb-p1.json';
import type { GreatBuildingDef } from '../stores/catalog';
import type { RankingRow } from '../stores/great-building-model';
import { type ConstructionCalc, type ConstructionInput, calculateConstruction, plusPercent } from './gb-calculator';

/** the definition lists the costs of the first ten levels, later ones grow by this factor per level */
const COST_GROWTH = 1.025;
const LISTED_LEVELS = 10;

/**
 * Forge points to build `level` up to `level + 1`, from the costs of the definition. Undefined without them. The index
 * is the level the construction starts from (checked against recorded constructions).
 */
export function levelCost(costs: readonly number[], level: number): number | undefined {
  if (!Number.isInteger(level) || level < 0) return undefined;
  if (level < LISTED_LEVELS) return costs[level];
  const last = costs[LISTED_LEVELS - 1];
  // never an integer from level 10 on, the epsilon only keeps a float a hair above one from rounding up
  return last === undefined ? undefined : Math.ceil(last * COST_GROWTH ** (level - LISTED_LEVELS + 1) - EPSILON);
}

/** The rewards of places 1 to 5 from the first: each place a share of the one above, rounded to 5. */
export function placeRewards(first: number): number[] {
  const out = [first];
  for (let i = 1; i < 5; i++) out.push(roundHalfUp((out[i - 1] as number) / (i + 1) / 5) * 5);
  return out;
}

export interface FirstPlaceReward {
  /** Forge points without the Arc bonus */
  fp: number;
  /** computed from the curve, not game data: off by up to 5 Forge points */
  estimate: boolean;
}

const ERAS: readonly string[] = table.eras;
const P1: Record<string, readonly (number | null)[]> = table.p1;
/** AllAge buildings pay like the High Middle Ages (the tables are equal) */
const ALL_AGE_LIKE = 'HighMiddleAge';

/** era number as the tables count it: index in the game order + 1 */
function eraNumber(era: string): number | undefined {
  const i = ERAS.indexOf(era === 'AllAge' ? ALL_AGE_LIKE : era);
  return i < 0 ? undefined : i + 1;
}

const ceil5 = (x: number) => Math.ceil(x / 5 - EPSILON) * 5;

let curve: number[] | undefined;

/**
 * The era independent curve A per level. The game seems to pay P1 = ceil5((era + 9) × A(level)), so every known value
 * bounds A to [(P1 − 5) / (era + 9), P1 / (era + 9)]. The middle of all bounds of a level is its A; where the bounds do
 * not quite meet (they miss by a hair at some levels) the middle still lies between them. The curve ends before the
 * first level without any game data (422 with the current table).
 */
function levelCurve(): number[] {
  if (curve) return curve;
  const low: number[] = [];
  const high: number[] = [];
  for (const [era, row] of Object.entries(P1)) {
    if (era === 'AllAge') continue;
    const factor = (eraNumber(era) ?? 0) + 9;
    row.forEach((p, level) => {
      if (p === null) return;
      low[level] = Math.max(low[level] ?? -Infinity, (p - 5) / factor);
      high[level] = Math.min(high[level] ?? Infinity, p / factor);
    });
  }
  // past the first level no table knows, single scattered rows would bound A too loosely for 5 Forge points
  const end = Array.from(high).indexOf(undefined as never);
  curve = high.slice(0, end < 0 ? high.length : end).map((h, level) => ((low[level] as number) + h) / 2);
  return curve;
}

/** P1 from the curve alone, undefined for an unknown era or a level no table reaches */
export function estimateFirstPlaceReward(era: string, level: number): number | undefined {
  const n = eraNumber(era);
  const a = levelCurve()[level];
  return n === undefined || a === undefined ? undefined : ceil5((n + 9) * a);
}

/** P1 of a great building of `era` on `level` (0-based, where the construction starts): game data, else estimated. */
export function firstPlaceReward(era: string, level: number): FirstPlaceReward | undefined {
  const known = P1[era]?.[level];
  if (typeof known === 'number') return { fp: known, estimate: false };
  const fp = estimateFirstPlaceReward(era, level);
  return fp === undefined ? undefined : { fp, estimate: true };
}

interface LevelPreviewInput {
  greatBuilding: GreatBuildingDef;
  /** the level the construction starts from */
  level: number;
  arcBonus: number;
  factor: number;
}

/** A level as it opens: its cost, the reward of place 1 and the five places with nobody on them. */
interface EmptyLevel {
  level: number;
  /** Forge points the level needs; undefined when the definition does not tell */
  required?: number;
  /** undefined when neither the table nor the curve knows the level */
  reward?: FirstPlaceReward;
  /** places 1 to 5 without deposits; undefined without cost or reward */
  rankings?: RankingRow[];
}

export interface LevelPreview extends Omit<EmptyLevel, 'rankings'> {
  /** the places of the empty level; undefined without cost or reward */
  calc?: ConstructionCalc;
}

/** The level as if it were open and nobody had paid yet: blueprints and medals are not known, they stay 0. */
export function emptyLevel(greatBuilding: GreatBuildingDef, level: number): EmptyLevel {
  const required = levelCost(greatBuilding.levelCosts, level);
  const reward = firstPlaceReward(greatBuilding.era, level);
  if (required === undefined || !reward) return { level, required, reward };
  const rankings: RankingRow[] = placeRewards(reward.fp).map((fp, i) => ({
    rank: i + 1,
    name: '',
    self: false,
    reward: { fp, blueprints: 0, medals: 0 },
  }));
  return { level, required, reward, rankings };
}

/** The level as if it were open and nobody had paid yet, priced like a foreign construction. */
export function previewLevel(input: LevelPreviewInput): LevelPreview {
  const { greatBuilding, level, arcBonus, factor } = input;
  const { required, reward, rankings } = emptyLevel(greatBuilding, level);
  if (required === undefined || !reward || !rankings) return { level, required, reward };
  const calc = calculateConstruction({
    level,
    maxLevel: level + 1,
    connected: true,
    required,
    rankings,
    arcBonus,
    factor,
  });
  return { level, required, reward, calc };
}

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
 */
export function levelUpAndFirst(
  input: ConstructionInput,
  greatBuilding: GreatBuildingDef | undefined,
): LevelUpAndFirst | undefined {
  const { level, maxLevel, rankings, arcBonus } = input;
  // the construction from `level` is open while level < maxLevel, so the next one needs level + 1 < maxLevel
  if (!greatBuilding || !input.connected || level + 1 >= maxLevel) return undefined;
  const calc = calculateConstruction(input);
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
  // worth it only above what the current level pays without levelling: the own place as it stands, or a place still to
  // take; a place whose safe cost levels the building is this case itself
  const best = Math.max(
    0,
    ...calc.places.filter((p) => p.mine || (p.available && !p.levelWarning)).map((p) => p.profit ?? 0),
  );
  if (total <= best) return undefined;
  return { nextLevel: level + 1, fill, rank, fillGain, firstCost: first.safeCost, firstGain: first.profit, total };
}
