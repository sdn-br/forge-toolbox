// The places of a great building construction: what each costs to take safely, what it pays and whether it is worth it.
import { roundHalfUp } from '../../shared/math';
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
  /** the holder cannot be passed anymore, the place is safe (also the own place when the player holds enough) */
  secured: boolean;
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
  /** gross minus safe cost; on the own place minus the larger of own deposit and safe cost */
  profit?: number;
  /** safe cost in percent of the net reward, one decimal */
  rate?: number;
  /** the own place only: the own deposit in percent of the net reward, what it costs if nobody passes */
  depositRate?: number;
  available: boolean;
  /** the safe cost is all that is left: the own deposit would level the building */
  levelWarning: boolean;
  /**
   * worth naming as an advice to the player (see `ConstructionCalc.fallbackGross`): without an own deposit when it
   * loses nothing or its safe cost is not above the demand, else when it leaves more than doing nothing. Set where the
   * place can be had or is the own place while not safe.
   */
  worthwhile?: boolean;
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
  /**
   * gross Forge points of the place the player ends on when he adds nothing and others pay what is missing in the way
   * that drops him furthest; 0 below the last place. Set while the own deposit is more than 0.
   */
  fallbackGross?: number;
  /** one per place with a reward, best rank first; empty when blocked */
  places: PlaceCalc[];
}

/** `amount` grown by `percent`, rounded; integer arithmetic first so 5 × 190 / 100 is exactly 9.5 */
export const plusPercent = (amount: number, percent: number) => roundHalfUp((amount * (100 + percent)) / 100);

const depositOf = (row: RankingRow | undefined) => row?.fp ?? 0;

/** what the session player has paid in */
export const ownDeposit = (rankings: RankingRow[]) => depositOf(rankings.find((r) => r.self));

/** the places with a reward, best rank first */
export const paidPlaces = (rows: Iterable<RankingRow>) =>
  [...rows].filter((r) => r.rank !== undefined && r.reward).sort((a, b) => (a.rank as number) - (b.rank as number));

/** a level of a great building; the lock state where known */
interface ConstructionLevel {
  level: number;
  /** Forge points the level needs */
  required: number;
  maxLevel?: number;
  connected?: boolean;
}

/**
 * The input of a construction: a lock state left out counts as open, the next level unlocked and the building
 * connected. Leave it out on purpose to price the places whatever the lock.
 */
export const constructionOf = (
  { level, required, maxLevel, connected }: ConstructionLevel,
  rankings: RankingRow[],
  { arcBonus, factor }: { arcBonus: number; factor: number },
): ConstructionInput => ({
  level,
  maxLevel: maxLevel ?? level + 1,
  connected: connected ?? true,
  required,
  rankings,
  arcBonus,
  factor,
});

/** `fp` in percent of the net reward, one decimal */
const percentOfReward = (fp: number, net: number) => (net > 0 ? roundHalfUp((fp / net) * 1000) / 10 : undefined);

export function calculateConstruction(input: ConstructionInput): ConstructionCalc {
  const { rankings, required, arcBonus, factor } = input;
  const mine = rankings.find((r) => r.self && r.rank !== undefined);
  const myDeposit = ownDeposit(rankings);
  const total = rankings.reduce((sum, r) => sum + depositOf(r), 0);
  const rest = required - (total - myDeposit);
  const base = { rest, missing: required - total, myDeposit, myRank: mine?.rank };
  if (input.level >= input.maxLevel) return { ...base, blocked: 'maxLevel', places: [] };
  if (!input.connected) return { ...base, blocked: 'unconnected', places: [] };

  const byRank = new Map(rankings.filter((r) => r.rank !== undefined).map((r) => [r.rank as number, r]));
  const paid = paidPlaces(byRank.values());

  const fallbackGross =
    myDeposit > 0 ? worstCaseGross(byRank, paid, mine?.rank, myDeposit, base.missing, arcBonus) : undefined;
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
    // below the own place: the player cannot hold a second place, so the place has no cost, profit or rate. The own
    // deposit cannot move down, a sum with it would only pretend a price.
    if (mine?.rank !== undefined && rank > mine.rank) {
      places.push({
        ...info,
        ...demand,
        demandExtra: demandCost,
        secured: false,
        available: false,
        levelWarning: false,
        status: 'unavailable',
      });
      continue;
    }
    // the own place is safe once the next one cannot pass it; any other once its holder cannot pass the cost
    const safeCost = roundHalfUp(((isMine ? depositOf(byRank.get(rank + 1)) : holderFp) + rest) / 2);
    // the own place costs the own deposit once that is more than the safe cost
    const profit = gross - (isMine ? Math.max(myDeposit, safeCost) : safeCost);
    const secured = safeCost <= holderFp;
    // the safe cost equals the one of the place above: the same cost buys the better place
    const dominated = !isMine && safeCost === places.at(-1)?.safeCost;
    const available = !isMine && !secured && !dominated;
    const levelWarning = available && safeCost >= rest;
    const priced = available || (isMine && !secured);
    const worthwhile =
      fallbackGross === undefined
        ? profit >= 0 || safeCost <= demandCost
        : gross - (safeCost - myDeposit) > fallbackGross;
    // not more profit than a higher place offers; places that complete the level stay out, `levelWarning` flags them
    const worse = available && !levelWarning && best !== undefined && profit <= best;
    if (available && !levelWarning) best = best === undefined ? profit : Math.max(best, profit);
    places.push({
      ...info,
      ...demand,
      secured,
      safeCost,
      safeExtra: safeCost - myDeposit,
      demandExtra: demandCost - myDeposit,
      demandBelowSafe: demandCost < safeCost,
      profit,
      rate: percentOfReward(safeCost, reward.fp),
      ...(isMine && { depositRate: percentOfReward(myDeposit, reward.fp) }),
      available,
      levelWarning,
      ...(priced && { worthwhile }),
      status: statusOf(isMine, available, levelWarning, worse, profit),
    });
  }
  return { ...base, ...(fallbackGross !== undefined && { fallbackGross }), places };
}

/**
 * The place the player falls to when he adds nothing: others pay `missing` Forge points so that he drops as far as
 * possible. Passing him costs a newcomer the own deposit + 1 (a tie keeps the earlier place), a holder below only the
 * difference; the cheapest passes come first, as many as the points allow. Below the last paid place nothing is left.
 */
function worstCaseGross(
  byRank: Map<number, RankingRow>,
  paid: RankingRow[],
  myRank: number | undefined,
  deposit: number,
  missing: number,
  arcBonus: number,
): number {
  if (myRank === undefined) return 0;
  const lastRank = paid.at(-1)?.rank as number;
  const below = [...byRank.values()]
    .filter((r) => (r.rank as number) > myRank && r.fp !== undefined)
    .map((r) => deposit + 1 - (r.fp as number))
    .sort((a, b) => a - b);
  let left = Math.max(0, missing);
  let rank = myRank;
  for (let i = 0; rank <= lastRank; i++) {
    const cost = below[i] ?? deposit + 1;
    if (cost > left) break;
    left -= cost;
    rank++;
  }
  const reward = paid.find((r) => r.rank === rank)?.reward;
  return reward ? plusPercent(reward.fp, arcBonus) : 0;
}

function statusOf(mine: boolean, available: boolean, levelWarning: boolean, worse: boolean, profit: number) {
  if (mine) return 'mine';
  if (!available) return 'unavailable';
  if (levelWarning) return 'levelWarning';
  if (worse) return 'worse';
  return profit >= 0 ? 'profit' : 'loss';
}
