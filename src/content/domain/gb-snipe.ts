// The snipe helper: which great buildings of a list could be worth a place, from the state the list brings and the
// rankings the toolbox saw before. Every row is calculated on an assumed ranking, in the best and the worst case.
import type { KnownGreatBuilding } from '../../shared/model';
import type { GreatBuildingDef, TierStart } from '../model/catalog';
import type { RankingRow } from '../model/great-building';
import { type ArcBonus, arcBonusAt } from './arc-bonus';
import {
  type ConstructionCalc,
  calculateConstruction,
  constructionOf,
  ownAdvice,
  type PlaceCalc,
} from './gb-calculator';
import { emptyLevel } from './gb-level-preview';

/** exact: the ranking is as current as the list; safe: a place pays even in the worst case; possible: only in the best */
export type SnipeTier = 'exact' | 'safe' | 'possible';

/** the best place that is worth taking in one case */
export interface SnipePlace {
  rank: number;
  /** the safe total deposit of the place; for an own deposit what the player still has to add */
  cost: number;
  /** gross reward minus the total own payment */
  profit: number;
  /** the total own payment when it is not `cost`: the own deposit plus what is added */
  paid?: number;
}

/** the session player's deposit in a building: place and Forge points */
export interface OwnDeposit {
  rank: number;
  fp: number;
}

export interface SnipeHit {
  owner: KnownGreatBuilding['owner'];
  entityId: number;
  def: KnownGreatBuilding['def'];
  level: number;
  invested: number;
  required: number;
  tier: SnipeTier;
  /** the best place of the best case, of the worst case when only that one pays */
  place: SnipePlace;
  /** the best place of the worst case; missing when no place pays there */
  worst?: SnipePlace;
  /** profit of the worst case (0 when no place pays there) and of the best case; equal when exact */
  profitLow: number;
  profitHigh: number;
  /** nothing paid in yet: the building may be locked (not connected or at the unlocked maximum level) */
  maybeLocked: boolean;
  /** when the list or the opened building told the state */
  seenAt: number;
  ownerShare: OwnerShare;
  /**
   * the own deposit that is not safe (`unsafe`) or not known to be (`unknown`), when topping it up pays; the places
   * then tell where to and what to add
   */
  own?: OwnDeposit & { status: Exclude<InvestmentStatus, 'safe'> };
  /** what the building gained since its previous sighting on this level */
  growth?: number;
  /** the sightings the growth lies between; missing for an entry stored without a span */
  growthFrom?: number;
  growthAt?: number;
}

/**
 * What the owner paid into the level, from the stored ranking: `current` when the ranking is the building's state,
 * `stale` when the progress moved since (the value is of the time `at`), `unknown` without a ranking of the level.
 */
export type OwnerShare =
  | { state: 'current'; fp: number }
  | { state: 'stale'; fp: number; at: number }
  | { state: 'unknown' };

/** the owner's row: by player id, else the row without a place, which only the owner has */
export const ownerRow = (rows: RankingRow[], owner: KnownGreatBuilding['owner']) =>
  rows.find((r) => r.player === owner) ?? rows.find((r) => r.rank === undefined && !r.self);

/**
 * The stored rankings when they belong to the building's current level. Progress on a level only grows, so a sum below
 * the rankings' means the level started over (the prestige update of 2026-11-05 reset begun levels): the rankings
 * then belong to the earlier pass and count as none.
 */
export const currentRankings = (b: KnownGreatBuilding): RankingRow[] | undefined =>
  b.rankingsLevel === b.level && (b.rankingsInvested ?? 0) <= b.invested ? b.rankings : undefined;

export function ownerShare(b: KnownGreatBuilding): OwnerShare {
  const rankings = currentRankings(b);
  if (!rankings) return { state: 'unknown' };
  const fp = ownerRow(rankings, b.owner)?.fp ?? 0;
  if (b.rankingsInvested === b.invested) return { state: 'current', fp };
  return { state: 'stale', fp, at: b.rankingsAt ?? b.seenAt };
}

/**
 * `safe`: nobody can pass the own place anymore; it stays safe on the same level, however much others pay in. `unsafe`:
 * the stored rankings fit the progress and someone can. `unknown`: without fitting rankings the rule without them
 * cannot tell; opening the building does.
 */
export type InvestmentStatus = 'safe' | 'unsafe' | 'unknown';

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
 * Whether the own place of a building with the own deposit `own` is safe: by the stored rankings, else safe once the
 * own deposit holds all other deposits and the rest together (nobody behind can pass it then, not even with everything
 * that is left), else unknown.
 */
export function investmentStatus(b: KnownGreatBuilding, own: number): InvestmentStatus {
  const byRankings = statusByRankings(b);
  if (byRankings) return byRankings;
  const rest = Math.max(0, b.required - b.invested);
  return own >= b.invested - own + rest ? 'safe' : 'unknown';
}

/**
 * The own deposit in a building: the own place the stored row keeps (town hall list or opened rankings), else the own
 * row of the current rankings; undefined when neither tells.
 */
export function ownDepositOf(b: KnownGreatBuilding): OwnDeposit | undefined {
  if (b.contribution) return { rank: b.contribution.rank, fp: b.contribution.forgePoints };
  const self = currentRankings(b)?.find((r) => r.self && r.rank !== undefined);
  return self && { rank: self.rank as number, fp: self.fp ?? 0 };
}

export interface SnipeInput {
  buildings: KnownGreatBuilding[];
  greatBuilding(def: KnownGreatBuilding['def']): GreatBuildingDef | undefined;
  /** Arc bonus of the session player in percent per tier; each building takes the one of its level */
  arcBonus: ArcBonus;
  /** the tiers of great building levels; the default ones when missing */
  tiers?: TierStart[];
}

export interface SnipeList {
  /** the rows with a worthwhile place, best profit first */
  hits: SnipeHit[];
  /** buildings without a worthwhile place */
  none: number;
  /** buildings with a safe own deposit (or one the row does not tell); the investments come with their own view */
  ownContribution: number;
  /** buildings with an own deposit that is not safe, where topping it up pays no more than doing nothing */
  ownNoGain: number;
  /** buildings whose rewards are unknown (no definition, or a level no table reaches) */
  unknownReward: number;
}

/** the rank of the foreign holder with the most Forge points on the places, the higher place on a tie */
function strongestRank(places: RankingRow[], holders: Map<number, RankingRow>): number | undefined {
  let strongest: number | undefined;
  for (const [rank, row] of holders) {
    if (rank > places.length || row.fp === undefined || row.self) continue;
    if (strongest === undefined || row.fp > (holders.get(strongest)?.fp ?? 0)) strongest = rank;
  }
  return strongest;
}

/**
 * The places of the level as the table pays them with their holders, `added` Forge points more on some ranks (a rank
 * that has no row yet gets one). The owner's row holds `ownerFp`.
 */
function assumed(
  places: RankingRow[],
  ownerFp: number,
  holders: Map<number, RankingRow>,
  extra: RankingRow[],
  added = new Map<number, number>(),
): RankingRow[] {
  const fill = (p: RankingRow): RankingRow => {
    const held = holders.get(p.rank as number);
    const fp = (held?.fp ?? 0) + (added.get(p.rank as number) ?? 0);
    return fp > 0 || held?.self ? { ...p, name: held?.name ?? '', self: held?.self ?? false, fp } : p;
  };
  const known = new Set([...places, ...extra].map((r) => r.rank));
  const fresh = [...added].flatMap(([rank, fp]): RankingRow[] =>
    known.has(rank) || fp <= 0 ? [] : [{ rank, name: '', self: false, fp }],
  );
  return [{ name: '', self: false, fp: ownerFp }, ...places.map(fill), ...extra.map(fill), ...fresh];
}

const worthwhile = (places: PlaceCalc[]): SnipePlace | undefined => {
  let best: SnipePlace | undefined;
  for (const p of places) {
    // a snipe is about the most profit, so a place that completes the level is a valid hit; paying a place at a factor
    // is the calculator's business
    if (!p.available || p.safeCost === undefined || p.profit === undefined || p.profit < 0) continue;
    if (!best || p.profit > best.profit) best = { rank: p.rank, cost: p.safeCost, profit: p.profit };
  }
  return best;
};

/**
 * The best place an own deposit that is not safe can be topped up to: the advice of the calculator's own line, which
 * names a place only when it brings more than doing nothing. The cost is what is added, the profit counts the whole
 * own payment.
 */
const toppedUp = (calc: ConstructionCalc): SnipePlace | undefined => {
  const best = ownAdvice(calc).best;
  if (!best || best.safeExtra === undefined || best.profit === undefined) return undefined;
  return { rank: best.rank, cost: best.safeExtra, profit: best.profit, paid: best.gross - best.profit };
};

/**
 * The worst case for an own deposit that is not safe: of the unknown `delta` Forge points as many as fit lie on the
 * place right below the own one (up to the own deposit, a tie keeps the earlier place), which makes the own place
 * dearest to hold; the rest on the strongest holder above it, or on the owner when nobody is above.
 */
function worstForOwn(
  places: RankingRow[],
  ownerFp: number,
  holders: Map<number, RankingRow>,
  extra: RankingRow[],
  own: OwnDeposit,
  delta: number,
): RankingRow[] {
  const below = own.rank + 1;
  const belowFp = holders.get(below)?.fp ?? extra.find((r) => r.rank === below)?.fp ?? 0;
  const under = Math.min(delta, Math.max(0, own.fp - belowFp));
  const top = strongestRank(places, new Map([...holders].filter(([rank]) => rank < own.rank)));
  const added = new Map([[below, under]]);
  if (top !== undefined) added.set(top, delta - under);
  return assumed(places, ownerFp + (top === undefined ? delta - under : 0), holders, extra, added);
}

export type SnipeResult = SnipeHit | 'none' | 'ownContribution' | 'ownNoGain' | 'unknownReward';

/**
 * One building of a list. `none` when no place pays, `ownContribution` for a building with a safe own deposit (or one
 * the row does not tell), `ownNoGain` for an own deposit that is not safe where topping up pays no more than doing
 * nothing, and `unknownReward` without a definition of the building. An own deposit that is not safe is a hit when
 * topping it up pays, by the rule of the calculator's own line. The Arc bonus is the one of the tier the level goes to.
 */
export function snipeBuilding(
  b: KnownGreatBuilding,
  def: GreatBuildingDef | undefined,
  arc: ArcBonus,
  tiers?: TierStart[],
): SnipeResult {
  const deposit = b.ownContribution ? ownDepositOf(b) : undefined;
  const status = deposit && investmentStatus(b, deposit.fp);
  if (b.ownContribution && (!deposit || status === 'safe')) return 'ownContribution';
  const own = deposit && status && status !== 'safe' ? { ...deposit, status } : undefined;
  // the stored cost is the real one of the level, so the rewards are exact
  const level = def && emptyLevel(def, b.level, b.required, tiers);
  const places = level?.rankings;
  if (!level || !places) return 'unknownReward';
  const arcBonus = arcBonusAt(arc, def, b.level, tiers);

  const solve = (rankings: RankingRow[]) => {
    const calc = calculateConstruction(constructionOf(b, rankings, { arcBonus, factor: 0 }));
    return own ? toppedUp(calc) : worthwhile(calc.places);
  };

  let ranked = currentRankings(b);
  // rankings whose own row is not the known own deposit are older than it and tell nothing sure about the places
  const selfRow = ranked?.find((r) => r.self && r.rank !== undefined);
  if (own && selfRow && (selfRow.rank !== own.rank || (selfRow.fp ?? 0) !== own.fp)) ranked = undefined;
  const holders = new Map(
    (ranked ?? []).flatMap((r) => (r.rank !== undefined && !r.self ? [[r.rank, r] as const] : [])),
  );
  // without rankings of the level nothing counts as known, not even a stored sum of another level
  let sum = ranked ? (b.rankingsInvested ?? 0) : 0;
  const beyond = (ranked ?? []).filter((r) => r.rank !== undefined && r.rank > places.length && !r.self);
  if (own) {
    const self: RankingRow = { rank: own.rank, name: '', self: true, fp: own.fp };
    holders.set(own.rank, self);
    if (own.rank > places.length) beyond.push(self);
    if (!ranked) {
      // the places above the own one hold at least the own deposit each (a tie keeps the earlier place)
      for (let rank = 1; rank < own.rank; rank++) holders.set(rank, { rank, name: '', self: false, fp: own.fp });
      sum = own.rank * own.fp;
    }
  }
  const ownerFp = (ranked && ownerRow(ranked, b.owner)?.fp) || 0;
  let exact = false;
  let best: RankingRow[];
  let worst: RankingRow[];
  if (ranked && b.invested === sum) {
    exact = true;
    best = worst = assumed(places, ownerFp, holders, beyond);
  } else {
    // the list is newer and the sum grew by delta: unknown deposits, from the owner at best, from the strongest holder
    // at worst. Without rankings nothing is known about who holds what and the sum is 0: at best the owner paid it
    // all, at worst one player holds it all. Around an own deposit the worst case is the one that threatens it most.
    const delta = Math.max(0, b.invested - sum);
    best = assumed(places, ownerFp + delta, holders, beyond);
    worst = own
      ? worstForOwn(places, ownerFp, holders, beyond, own, delta)
      : assumed(places, ownerFp, holders, beyond, new Map([[strongestRank(places, holders) ?? 1, delta]]));
  }

  const atBest = solve(best);
  const atWorst = exact ? atBest : solve(worst);
  const place = atBest ?? atWorst;
  if (!place) return own ? 'ownNoGain' : 'none';
  const tier: SnipeTier = exact ? 'exact' : atWorst ? 'safe' : 'possible';
  // without a paying place in the worst case the range starts at nothing gained, or at the loss of the one place
  const low = atWorst?.profit ?? Math.min(0, place.profit);
  return {
    owner: b.owner,
    entityId: b.entityId,
    def: b.def,
    level: b.level,
    invested: b.invested,
    required: b.required,
    tier,
    place,
    ...(atWorst && !exact && { worst: atWorst }),
    profitLow: Math.min(low, place.profit),
    profitHigh: Math.max(low, place.profit),
    maybeLocked: b.invested === 0,
    seenAt: b.seenAt,
    ownerShare: ownerShare(b),
    ...(own && { own }),
    ...(b.growth !== undefined && { growth: b.growth }),
    ...(b.growthFrom !== undefined && { growthFrom: b.growthFrom }),
    ...(b.growthAt !== undefined && { growthAt: b.growthAt }),
  };
}

/** sorts by the best case, the worst case breaking ties */
export const snipeProfitKey = (h: SnipeHit) => h.profitHigh * 1e9 + h.profitLow;

/** the profit per Forge point of the whole own payment: the safe cost, or for an own deposit the deposit and the rest */
const perFp = (p: SnipePlace) => p.profit / (p.paid ?? p.cost);

/**
 * Profit per Forge point paid in, of the best case (`high`, the place of `profitHigh`) and of the worst case (`low`):
 * 20 profit on 100 paid in is 0.2. Like `profitLow`, without a paying place in the worst case it starts at nothing
 * gained, or at the loss of the one place; equal when exact.
 */
export function snipeRatio(h: SnipeHit): { low: number; high: number } {
  const place = perFp(h.place);
  if (h.profitLow === h.profitHigh) return { low: place, high: place };
  const low = h.worst ? perFp(h.worst) : Math.min(0, place);
  return { low: Math.min(low, place), high: Math.max(low, place) };
}

/** the best profit first, by `snipeProfitKey` */
export const bySnipeProfit = (a: SnipeHit, b: SnipeHit) => snipeProfitKey(b) - snipeProfitKey(a);

/** the tiers from the best: exact over safe over possible, for sorting */
export const TIER_ORDER: Record<SnipeTier, number> = { exact: 2, safe: 1, possible: 0 };

/** Each building of a list with what the snipe helper makes of it, in list order. */
export const snipeBuildings = (
  buildings: KnownGreatBuilding[],
  greatBuilding: SnipeInput['greatBuilding'],
  arc: ArcBonus,
  tiers?: TierStart[],
): { building: KnownGreatBuilding; result: SnipeResult }[] =>
  buildings.map((b) => ({ building: b, result: snipeBuilding(b, greatBuilding(b.def), arc, tiers) }));

/** The whole list: hits by profit, the rest counted. */
export function snipeList(input: SnipeInput): SnipeList {
  const out: SnipeList = { hits: [], none: 0, ownContribution: 0, ownNoGain: 0, unknownReward: 0 };
  for (const { result: r } of snipeBuildings(input.buildings, input.greatBuilding, input.arcBonus, input.tiers)) {
    if (r === 'none') out.none++;
    else if (r === 'ownContribution') out.ownContribution++;
    else if (r === 'ownNoGain') out.ownNoGain++;
    else if (r === 'unknownReward') out.unknownReward++;
    else out.hits.push(r);
  }
  out.hits.sort(bySnipeProfit);
  return out;
}
