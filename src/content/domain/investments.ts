// The own investments: where the session player's Forge points sit in great buildings of others and what they bring.
import type { BuildingDefId, PlayerId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import type { GreatBuildingDef, TierStart } from '../model/catalog';
import { type ArcBonus, arcBonusAt } from './arc-bonus';
import { calculateConstruction, constructionOf, plusPercent } from './gb-calculator';
import { currentRankings, type SnipeHit, snipeBuildings } from './gb-snipe';

/**
 * `safe`: nobody can pass the own place anymore; it stays safe on the same level, however much others pay in. `unsafe`: the stored rankings fit the progress and someone can. `unknown`:
 * without fitting rankings the rule without them cannot tell; opening the building does.
 */
export type InvestmentStatus = 'safe' | 'unsafe' | 'unknown';

export interface Investment {
  owner: PlayerId;
  entityId: number;
  cityEntityId: BuildingDefId;
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

/**
 * The own place decided with stored rankings of the building's level: the "own place" rule of the calculator, with the
 * progress the rankings were taken at (the calculator reads it from their sum). A building at its highest level or not
 * connected is still decided by the places, as the calculator would once it opens again. When the progress only grew
 * since, a safe place stays safe and an unsafe one is undecided: nobody can pass a safe place even if one rival pays
 * the whole rest, and every foreign deposit lowers the rest by at least what that rival gains. Undefined when the
 * rankings do not fit, hold no own place or cannot decide the grown building.
 */
function statusByRankings(b: KnownGreatBuilding): InvestmentStatus | undefined {
  const rankings = currentRankings(b);
  if (!rankings) return undefined;
  const calc = calculateConstruction(
    constructionOf({ level: b.level, required: b.required }, rankings, { arcBonus: 0, factor: 0 }),
  );
  const mine = calc.places.find((p) => p.mine);
  if (!mine) return undefined;
  if (mine.secured) return 'safe';
  return b.rankingsInvested === b.invested ? 'unsafe' : undefined;
}

/**
 * Without rankings the own place is safe once the own deposit holds all other deposits and the rest together: nobody
 * behind can pass it then, not even with everything that is left.
 */
const statusWithout = (own: number, invested: number, rest: number): InvestmentStatus =>
  own >= invested - own + rest ? 'safe' : 'unknown';

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
    const gross = plusPercent(c.reward, arcBonusAt(arc, greatBuilding(b.cityEntityId), b.level, tiers));
    const rest = Math.max(0, b.required - b.invested);
    const growth = b.growthBase !== undefined && b.growthBase < b.invested ? b.invested - b.growthBase : undefined;
    return [
      {
        owner: b.owner,
        entityId: b.entityId,
        cityEntityId: b.cityEntityId,
        level: b.level,
        rank: c.rank,
        forgePoints: c.forgePoints,
        reward: c.reward,
        gross,
        profit: gross - c.forgePoints,
        invested: b.invested,
        required: b.required,
        rest,
        status: statusByRankings(b) ?? statusWithout(c.forgePoints, b.invested, rest),
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
  const others = buildings.filter((b) => b.owner !== me);
  return snipeBuildings(others, greatBuilding, arc, tiers).flatMap<PossibleInvestment>(({ building, result: r }) => {
    if (r === 'ownContribution') return [];
    return [typeof r === 'string' ? { building } : { building, hit: r }];
  });
}
