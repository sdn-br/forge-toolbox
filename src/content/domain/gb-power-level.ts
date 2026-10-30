// The power level plan of an own great building: the own share of each level over a span, the double harvest taken
// off, and what it adds up to. The open level counts with its real ranking, every other one as it opens, empty.
import type { GreatBuildingDef } from '../model/catalog';
import type { RankingRow } from '../model/great-building';
import { type DoubleHarvest, doubleHarvest, type NextProduction } from './gb-double-harvest';
import { emptyLevel } from './gb-level-preview';
import { calculateOwnShare, type OwnShareCalc, type OwnShareInput } from './gb-own-share';

export interface PowerLevelInput {
  def: string;
  greatBuilding: GreatBuildingDef;
  /** the building's level and the highest one the owner has unlocked */
  level: number;
  maxLevel: number;
  /** Forge points the open level needs and its ranking */
  required: number;
  rankings: RankingRow[];
  nextProduction?: NextProduction;
  /** the constructions from `from` up to the one ending at `to` */
  from: number;
  to: number;
  /** how the owner hands out the places; the promised payments count on the open level only */
  share: Omit<OwnShareInput, 'required' | 'rankings'>;
}

export interface PowerLevelRow {
  /** the construction from `level` to `level + 1` */
  level: number;
  /** the open level, calculated with the real ranking */
  open: boolean;
  /** the owner has not unlocked the level yet */
  locked: boolean;
  calc: OwnShareCalc;
  /** the rewards of the level come from the curve, not from game data */
  estimate: boolean;
  /** missing without a Forge point production or without a value for the level */
  harvest?: DoubleHarvest;
  /** what the owner pays himself; on the open level what is still open */
  ownShare: number;
  /** own share minus double harvest */
  net: number;
  /** running total of `net` from the first row */
  sum: number;
}

export interface PowerLevelPlan {
  rows: PowerLevelRow[];
  /** the plan ends before `to`: nothing is known about the reward of this level */
  endsAt?: number;
  totals: { ownShare: number; harvest: number; net: number };
}

export function powerLevelPlan(input: PowerLevelInput): PowerLevelPlan {
  const { def, greatBuilding, level, maxLevel, share } = input;
  const atMax = level >= maxLevel;
  const rows: PowerLevelRow[] = [];
  let endsAt: number | undefined;
  let sum = 0;
  for (let x = input.from; x < input.to; x++) {
    const open = x === level && !atMax;
    const empty = open ? undefined : emptyLevel(greatBuilding, x);
    const required = open ? input.required : empty?.required;
    const rankings = open ? input.rankings : empty?.rankings;
    if (required === undefined || !rankings) {
      endsAt = x;
      break;
    }
    const calc = calculateOwnShare({ ...share, required, rankings, exts: open ? share.exts : [] });
    const harvest = doubleHarvest(def, greatBuilding, x, input.nextProduction);
    const ownShare = Math.max(0, calc.open);
    const net = ownShare - (harvest?.fp ?? 0);
    sum += net;
    rows.push({
      level: x,
      open,
      locked: x + 1 > maxLevel,
      calc,
      estimate: empty?.reward?.estimate === true,
      ...(harvest && { harvest }),
      ownShare,
      net,
      sum,
    });
  }
  return {
    rows,
    ...(endsAt !== undefined && { endsAt }),
    totals: {
      ownShare: rows.reduce((s, r) => s + r.ownShare, 0),
      harvest: rows.reduce((s, r) => s + (r.harvest?.fp ?? 0), 0),
      net: sum,
    },
  };
}
