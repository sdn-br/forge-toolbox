// The own investments: where the session player's Forge points sit in great buildings of others and what they bring.
import type { BuildingDefId, PlayerId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { GreatBuildingDef, TierStart } from '../model/catalog';
import { type ArcBonus, arcBonusAt } from './arc-bonus';
import { plusPercent } from './gb-calculator';
import { type InvestmentStatus, investmentStatus, type SnipeHit, snipeBuildings } from './gb-snipe';

export type { InvestmentStatus } from './gb-snipe';

export interface Investment {
  owner: PlayerId;
  entityId: number;
  def: BuildingDefId;
  level: number;
  rank: number;
  /** own deposit */
  forgePoints: number;
  /** net reward of the place */
  reward: number;
  /** with the own Arc bonus */
  gross: number;
  /** gross minus own deposit */
  profit: number;
  /** progress of the level, all deposits */
  invested: number;
  required: number;
  /** what is missing until the level up */
  rest: number;
  status: InvestmentStatus;
  /** Forge points paid in since the building was last open; missing without growth */
  growth?: number;
}

export interface InvestmentTotals {
  /** own deposits of all rows */
  circulating: number;
  /** profit of the safe rows */
  profitSafe: number;
  /** profit of all rows */
  profitTotal: number;
}

export interface Investments {
  /** rows with growth first, then the rest ascending */
  rows: Investment[];
}

/** the sums of some rows: the own deposits, the profit of the safe rows and of all */
export const sumTotals = (rows: Investment[]): InvestmentTotals =>
  rows.reduce<InvestmentTotals>(
    (sum, r) => ({
      circulating: sum.circulating + r.forgePoints,
      profitSafe: sum.profitSafe + (r.status === 'safe' ? r.profit : 0),
      profitTotal: sum.profitTotal + r.profit,
    }),
    { circulating: 0, profitSafe: 0, profitTotal: 0 },
  );

/** the default order of the own investments: rows with growth first, then the rest to the level up ascending */
export const byDefaultOrder = (a: Investment, b: Investment): number =>
  Number(b.growth !== undefined) - Number(a.growth !== undefined) || a.rest - b.rest;

/** The own investments; each reward grows by the Arc bonus of the tier its level goes to. */
export function myInvestments(
  buildings: KnownGreatBuilding[],
  arc: ArcBonus,
  greatBuilding: (def: BuildingDefId) => GreatBuildingDef | undefined,
  tiers?: TierStart[],
): Investments {
  const rows = buildings.flatMap<Investment>((b) => {
    const c = b.contribution;
    if (!c) return [];
    const gross = plusPercent(c.reward, arcBonusAt(arc, greatBuilding(b.def), b.level, tiers));
    const rest = Math.max(0, b.required - b.invested);
    const growth = b.growthBase !== undefined && b.growthBase < b.invested ? b.invested - b.growthBase : undefined;
    return [
      {
        owner: b.owner,
        entityId: b.entityId,
        def: b.def,
        level: b.level,
        rank: c.rank,
        forgePoints: c.forgePoints,
        reward: c.reward,
        gross,
        profit: gross - c.forgePoints,
        invested: b.invested,
        required: b.required,
        rest,
        status: investmentStatus(b, c.forgePoints),
        ...(growth !== undefined && { growth }),
      },
    ];
  });
  rows.sort(byDefaultOrder);
  return { rows };
}

/** A great building of another player without an own place, with the best place the snipe helper finds there. */
export interface PossibleInvestment {
  building: KnownGreatBuilding;
  /** missing when no place pays or the rewards of the level are unknown */
  hit?: SnipeHit;
}

/**
 * Every known great building of another player the session player has not invested in, rated as the snipe helper rates
 * a list. `me` leaves out the own buildings; buildings with an own contribution belong to the own investments.
 */
export function possibleInvestments(
  buildings: KnownGreatBuilding[],
  greatBuilding: (def: BuildingDefId) => GreatBuildingDef | undefined,
  arc: ArcBonus,
  me?: PlayerId,
  tiers?: TierStart[],
): PossibleInvestment[] {
  const others = buildings.filter((b) => b.owner !== me && !b.ownContribution);
  return snipeBuildings(others, greatBuilding, arc, tiers).map<PossibleInvestment>(({ building, result: r }) =>
    typeof r === 'string' ? { building } : { building, hit: r },
  );
}
