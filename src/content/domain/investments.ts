// The own investments: where the session player's Forge points sit in great buildings of others and what they bring.
import type { BuildingDefId, PlayerId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';
import { calculateConstruction, plusPercent } from './gb-calculator';

/**
 * `safe`: nobody can pass the own place anymore. `unsafe`: the stored rankings fit the progress and someone can. `unknown`:
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
  totals: InvestmentTotals;
}

/**
 * The own place decided with stored rankings, when they belong to the building's level and their sum is its progress:
 * the "own place" rule of the calculator. A building at its highest level or not connected is still decided by the
 * places, as the calculator would once it opens again. Undefined when the rankings do not fit or hold no own place.
 */
function statusByRankings(b: KnownGreatBuilding): InvestmentStatus | undefined {
  if (!b.rankings || b.rankingsLevel !== b.level || b.rankingsInvested !== b.invested) return undefined;
  const calc = calculateConstruction({
    level: b.level,
    maxLevel: b.level + 1,
    connected: true,
    required: b.required,
    rankings: b.rankings,
    arcBonus: 0,
    factor: 0,
  });
  const mine = calc.places.find((p) => p.mine);
  if (!mine) return undefined;
  return mine.secured ? 'safe' : 'unsafe';
}

/**
 * Without rankings the own place is safe once the own deposit holds all other deposits and the rest together: nobody
 * behind can pass it then, not even with everything that is left.
 */
const statusWithout = (own: number, invested: number, rest: number): InvestmentStatus =>
  own >= invested - own + rest ? 'safe' : 'unknown';

export function myInvestments(buildings: KnownGreatBuilding[], arcBonus: number): Investments {
  const rows = buildings.flatMap<Investment>((b) => {
    const c = b.contribution;
    if (!c) return [];
    const gross = plusPercent(c.reward, arcBonus);
    const rest = Math.max(0, b.required - b.invested);
    const growth =
      b.openedProgress !== undefined && b.openedProgress < b.invested ? b.invested - b.openedProgress : undefined;
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
  rows.sort((a, b) => Number(b.growth !== undefined) - Number(a.growth !== undefined) || a.rest - b.rest);
  const totals = rows.reduce<InvestmentTotals>(
    (sum, r) => ({
      circulating: sum.circulating + r.forgePoints,
      profitSafe: sum.profitSafe + (r.status === 'safe' ? r.profit : 0),
      profitTotal: sum.profitTotal + r.profit,
    }),
    { circulating: 0, profitSafe: 0, profitTotal: 0 },
  );
  return { rows, totals };
}
