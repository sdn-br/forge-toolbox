// The places of a great building construction: what each costs to take safely, what it pays and whether it is worth it.
import type { City } from '../stores/city-model';
import type { RankingRow } from '../stores/great-building-model';

export interface ConstructionInput {
  level: number;
  maxLevel: number;
  connected: boolean;
  /** Forge points the current level needs */
  required: number;
  rankings: RankingRow[];
  /** Arc bonus of the session player in percent, e.g. 95.5 */
  arcBonus: number;
  /** factor in percent the player asks for when others pay a place, e.g. 90 asks 1.9 times the reward */
  factor: number;
}

/** Colour of a row: the own place, then unavailable, level warning, worse than a higher place, profit or loss. */
export type PlaceStatus = 'mine' | 'unavailable' | 'levelWarning' | 'worse' | 'profit' | 'loss';

export interface PlaceCalc {
  rank: number;
  /** who holds the place now; missing when it is empty */
  holder?: string;
  /** Forge points on the place now, 0 when empty */
  holderFp: number;
  mine: boolean;
  /** reward as the game names it (assumed net, before the Arc bonus) */
  net: number;
  /** with the Arc bonus of the session player */
  gross: number;
  blueprints: number;
  medals: number;
  /**
   * below the own place: the player cannot hold a second place, so the place has no cost, profit or rate. The own
   * deposit cannot move down, a sum with it would only pretend a price.
   */
  belowMine: boolean;
  /** the holder cannot be passed anymore, the place is safe (also the own place when the player holds enough) */
  secured: boolean;
  /** the safe cost equals the one of the place above: the same cost buys the better place */
  dominated: boolean;
  /** total own deposit that nobody can outbid anymore; missing below the own place */
  safeCost?: number;
  /**
   * what the owner asks for the place at the factor: the net reward grown by the factor. A deal, the owner makes the
   * place safe himself, so the safe cost does not bound it.
   */
  demandCost?: number;
  /** the demand is more than can still be paid until the level up */
  demandOverRest?: boolean;
  /** the demand is below the safe cost: the place holds only by agreement */
  demandBelowSafe?: boolean;
  /** gross minus demand */
  demandProfit?: number;
  /** what the player still has to add to reach the cost, his deposit subtracted */
  safeExtra?: number;
  /** below the own place the demand itself, the own deposit cannot move down */
  demandExtra?: number;
  /** gross minus safe cost */
  profit?: number;
  /** safe cost in percent of the net reward, one decimal */
  rate?: number;
  /** the own place only: the own deposit in percent of the net reward, what it costs if nobody passes */
  depositRate?: number;
  available: boolean;
  /** the safe cost is all that is left: the own deposit would level the building */
  levelWarning: boolean;
  /** not more profit than a higher place offers */
  worse: boolean;
  status: PlaceStatus;
}

export interface ConstructionCalc {
  /** the building takes no Forge points now */
  blocked?: 'maxLevel' | 'unconnected';
  /** what the others may still add: required minus the deposits of everyone else */
  rest: number;
  /** Forge points until the level is full */
  missing: number;
  myDeposit: number;
  myRank?: number;
  /** one per place with a reward, best rank first; empty when blocked */
  places: PlaceCalc[];
}

// Floating point products like 5 × 1.9 come out a hair below .5; the epsilon rounds them as the arithmetic means.
const EPSILON = 1e-9;

/** Commercial rounding, halves away from zero. */
export const roundHalfUp = (x: number): number => Math.sign(x) * Math.floor(Math.abs(x) + 0.5 + EPSILON);

/** `amount` grown by `percent`, rounded; integer arithmetic first so 5 × 190 / 100 is exactly 9.5 */
const plusPercent = (amount: number, percent: number) => roundHalfUp((amount * (100 + percent)) / 100);

const depositOf = (row: RankingRow | undefined) => row?.fp ?? 0;

export function calculateConstruction(input: ConstructionInput): ConstructionCalc {
  const { rankings, required, arcBonus, factor } = input;
  const mine = rankings.find((r) => r.self && r.rank !== undefined);
  const myDeposit = depositOf(rankings.find((r) => r.self));
  const total = rankings.reduce((sum, r) => sum + depositOf(r), 0);
  const rest = required - (total - myDeposit);
  const base = { rest, missing: required - total, myDeposit, myRank: mine?.rank };
  if (input.level >= input.maxLevel) return { ...base, blocked: 'maxLevel', places: [] };
  if (!input.connected) return { ...base, blocked: 'unconnected', places: [] };

  const byRank = new Map(rankings.filter((r) => r.rank !== undefined).map((r) => [r.rank as number, r]));
  const paid = [...byRank.values()].filter((r) => r.reward).sort((a, b) => (a.rank as number) - (b.rank as number));

  const places: PlaceCalc[] = [];
  let best: number | undefined;
  for (const row of paid) {
    const rank = row.rank as number;
    const reward = row.reward as NonNullable<RankingRow['reward']>;
    const isMine = row.self;
    const holderFp = depositOf(row);
    const gross = plusPercent(reward.fp, arcBonus);
    const info = {
      rank,
      holder: row.fp === undefined ? undefined : row.name,
      holderFp,
      mine: isMine,
      net: reward.fp,
      gross,
      blueprints: plusPercent(reward.blueprints, arcBonus),
      medals: plusPercent(reward.medals, arcBonus),
    };
    const demandCost = plusPercent(reward.fp, factor);
    const demand = { demandCost, demandOverRest: demandCost > rest, demandProfit: gross - demandCost };
    if (mine?.rank !== undefined && rank > mine.rank) {
      places.push({
        ...info,
        ...demand,
        demandExtra: demandCost,
        belowMine: true,
        secured: false,
        dominated: false,
        available: false,
        levelWarning: false,
        worse: false,
        status: 'unavailable',
      });
      continue;
    }
    // the own place is safe once the next one cannot pass it; any other once its holder cannot pass the cost
    const safeCost = roundHalfUp(((isMine ? depositOf(byRank.get(rank + 1)) : holderFp) + rest) / 2);
    const profit = gross - safeCost;
    const secured = safeCost <= holderFp;
    const dominated = !isMine && safeCost === places.at(-1)?.safeCost;
    const available = !isMine && !secured && !dominated;
    const percentOf = (fp: number) => (reward.fp > 0 ? roundHalfUp((fp / reward.fp) * 1000) / 10 : undefined);
    const levelWarning = available && safeCost >= rest;
    const worse = available && !levelWarning && best !== undefined && profit <= best;
    if (available && !levelWarning) best = best === undefined ? profit : Math.max(best, profit);
    places.push({
      ...info,
      ...demand,
      belowMine: false,
      secured,
      dominated,
      safeCost,
      safeExtra: safeCost - myDeposit,
      demandExtra: demandCost - myDeposit,
      demandBelowSafe: demandCost < safeCost,
      profit,
      rate: percentOf(safeCost),
      ...(isMine && { depositRate: percentOf(myDeposit) }),
      available,
      levelWarning,
      worse,
      status: statusOf(isMine, available, levelWarning, worse, profit),
    });
  }
  return { ...base, places };
}

function statusOf(mine: boolean, available: boolean, levelWarning: boolean, worse: boolean, profit: number) {
  if (mine) return 'mine';
  if (!available) return 'unavailable';
  if (levelWarning) return 'levelWarning';
  if (worse) return 'worse';
  return profit >= 0 ? 'profit' : 'loss';
}

/** The lowest rate of all places the player could take, for the snipe helper; undefined when none is free. */
export function bestRate(calc: ConstructionCalc): number | undefined {
  const rates = calc.places.filter((p) => p.available && p.rate !== undefined).map((p) => p.rate as number);
  return rates.length ? Math.min(...rates) : undefined;
}

/** A limited bonus of the player as `BonusService.getLimitedBonuses` lists it. */
export interface LimitedBonus {
  type: string;
  value: number;
  /** the own building that grants it, when it comes from one */
  entityId?: number;
}

const CONTRIBUTION_BOOST = 'contribution_boost';

/**
 * The Arc bonus in percent: the contribution boosts of the own great buildings plus limited ones of that type. Limited
 * bonuses of own great buildings show up in both lists (seen with a supplies boost), so a limited bonus of a building
 * that already counts is skipped.
 */
export function arcBonus(own: City | undefined, limited: LimitedBonus[] = []): number {
  const counted = new Set<number>();
  let sum = 0;
  for (const b of own?.buildings.values() ?? []) {
    const bonus = b.greatBuilding?.bonus;
    if (bonus?.type !== CONTRIBUTION_BOOST) continue;
    sum += bonus.value;
    counted.add(b.id);
  }
  for (const l of limited) {
    if (l.type === CONTRIBUTION_BOOST && (l.entityId === undefined || !counted.has(l.entityId))) sum += l.value;
  }
  return sum;
}
