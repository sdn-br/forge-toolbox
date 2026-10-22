// A later level of a great building as if it were open and empty: what it costs and what each place pays. Pure, so
// the own great buildings can use it too (Eigenanteilsrechner).
import table from '../data/gb-p1.json';
import type { GreatBuildingDef } from '../stores/catalog';
import type { RankingRow } from '../stores/great-building-model';
import { type ConstructionCalc, calculateConstruction, roundHalfUp } from './gb-calculator';

/** the definition lists the costs of the first ten levels, later ones grow by this factor per level */
const COST_GROWTH = 1.025;
const LISTED_LEVELS = 10;
const EPSILON = 1e-9;

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

export interface LevelPreviewInput {
  greatBuilding: GreatBuildingDef;
  /** the level the construction starts from */
  level: number;
  arcBonus: number;
  factor: number;
}

export interface LevelPreview {
  level: number;
  /** Forge points the level needs; undefined when the definition does not tell */
  required?: number;
  /** undefined when neither the table nor the curve knows the level */
  reward?: FirstPlaceReward;
  /** the places of the empty level; undefined without cost or reward */
  calc?: ConstructionCalc;
}

/** The level as if it were open and nobody had paid yet. Blueprints and medals are not known, they stay 0. */
export function previewLevel(input: LevelPreviewInput): LevelPreview {
  const { greatBuilding, level, arcBonus, factor } = input;
  const required = levelCost(greatBuilding.levelCosts, level);
  const reward = firstPlaceReward(greatBuilding.era, level);
  if (required === undefined || !reward) return { level, required, reward };
  const rankings: RankingRow[] = placeRewards(reward.fp).map((fp, i) => ({
    rank: i + 1,
    name: '',
    self: false,
    reward: { fp, blueprints: 0, medals: 0 },
  }));
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
