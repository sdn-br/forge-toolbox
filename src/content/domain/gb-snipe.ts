// The snipe helper: which great buildings of a list could be worth a place, from the state the list brings and the
// rankings the toolbox saw before. Every row is calculated on an assumed ranking, in the best and the worst case.
import type { KnownGreatBuilding } from '../../shared/model';
import type { GreatBuildingDef } from '../stores/catalog';
import type { RankingRow } from '../stores/great-building-model';
import { calculateConstruction, type PlaceCalc } from './gb-calculator';
import { emptyLevel } from './gb-level-preview';

/** exact: the ranking is as current as the list; safe: a place pays even in the worst case; possible: only in the best */
export type SnipeTier = 'exact' | 'safe' | 'possible';

/** the best place that is worth taking in one case */
export interface SnipePlace {
  rank: number;
  /** the safe total deposit of the place */
  cost: number;
  profit: number;
}

export interface SnipeHit {
  owner: KnownGreatBuilding['owner'];
  entityId: number;
  cityEntityId: KnownGreatBuilding['cityEntityId'];
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
  /** the rewards come from the curve, not from game data */
  estimate: boolean;
  /** nothing paid in yet: the building may be locked (not connected or at the unlocked maximum level) */
  maybeLocked: boolean;
  /** when the list or the opened building told the state */
  seenAt: number;
  ownerShare: OwnerShare;
  /** what the building gained since its previous sighting on this level */
  growth?: number;
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
const ownerRow = (rows: RankingRow[], owner: KnownGreatBuilding['owner']) =>
  rows.find((r) => r.player === owner) ?? rows.find((r) => r.rank === undefined && !r.self);

/** the stored rankings when they belong to the building's current level */
export const currentRankings = (b: KnownGreatBuilding): RankingRow[] | undefined =>
  b.rankingsLevel === b.level ? b.rankings : undefined;

export function ownerShare(b: KnownGreatBuilding): OwnerShare {
  const rankings = currentRankings(b);
  if (!rankings) return { state: 'unknown' };
  const fp = ownerRow(rankings, b.owner)?.fp ?? 0;
  if (b.rankingsInvested === b.invested) return { state: 'current', fp };
  return { state: 'stale', fp, at: b.rankingsAt ?? b.seenAt };
}

export interface SnipeInput {
  buildings: KnownGreatBuilding[];
  greatBuilding(def: KnownGreatBuilding['cityEntityId']): GreatBuildingDef | undefined;
  /** Arc bonus of the session player in percent */
  arcBonus: number;
}

export interface SnipeList {
  /** the rows with a worthwhile place, best profit first */
  hits: SnipeHit[];
  /** buildings without a worthwhile place */
  none: number;
  /** buildings the session player invested in; the investments come with their own view */
  ownContribution: number;
  /** buildings whose rewards are unknown (no definition, or a level no table reaches) */
  unknownReward: number;
}

/** The places of the level as the table pays them, nobody on them. The owner's row holds `ownerFp`. */
function assumed(
  places: RankingRow[],
  ownerFp: number,
  holders: Map<number, RankingRow>,
  extra: RankingRow[],
  strongestExtra = 0,
): RankingRow[] {
  let strongest: number | undefined;
  for (const [rank, row] of holders) {
    if (rank > places.length || row.fp === undefined) continue;
    if (strongest === undefined || row.fp > (holders.get(strongest)?.fp ?? 0)) strongest = rank;
  }
  const grow = strongest ?? 1;
  const rows = places.map((p) => {
    const held = holders.get(p.rank as number);
    const fp = (held?.fp ?? 0) + (p.rank === grow ? strongestExtra : 0);
    return fp > 0 ? { ...p, name: held?.name ?? '', fp } : p;
  });
  return [{ name: '', self: false, fp: ownerFp }, ...rows, ...extra];
}

const worthwhile = (places: PlaceCalc[]): SnipePlace | undefined => {
  let best: SnipePlace | undefined;
  for (const p of places) {
    // a snipe is about profit; paying a place at a factor is the calculator's business
    if (!p.available || p.safeCost === undefined || p.profit === undefined || p.profit < 0) continue;
    if (!best || p.profit > best.profit) best = { rank: p.rank, cost: p.safeCost, profit: p.profit };
  }
  return best;
};

/**
 * One building of a list. `none` when no place pays, `ownContribution` for a building the player invested in, and
 * `unknownReward` when the rewards of the level are not known.
 */
export function snipeBuilding(
  b: KnownGreatBuilding,
  def: GreatBuildingDef | undefined,
  arcBonus: number,
): SnipeHit | 'none' | 'ownContribution' | 'unknownReward' {
  if (b.ownContribution) return 'ownContribution';
  const level = def && emptyLevel(def, b.level);
  const places = level?.rankings;
  if (!level || !places) return 'unknownReward';

  const input = { level: b.level, maxLevel: b.maxLevel ?? b.level + 1, connected: b.connected ?? true };
  const solve = (rankings: RankingRow[]) =>
    worthwhile(calculateConstruction({ ...input, required: b.required, rankings, arcBonus, factor: 0 }).places);

  const ranked = currentRankings(b);
  const holders = new Map(
    (ranked ?? []).flatMap((r) => (r.rank !== undefined && !r.self ? [[r.rank, r] as const] : [])),
  );
  // without rankings of the level nothing counts as known, not even a stored sum of another level
  const sum = ranked ? (b.rankingsInvested ?? 0) : 0;
  const beyond = (ranked ?? []).filter((r) => r.rank !== undefined && r.rank > places.length && !r.self);
  const ownerFp = (ranked && ownerRow(ranked, b.owner)?.fp) || 0;
  let exact = false;
  let best: RankingRow[];
  let worst: RankingRow[];
  if (ranked && b.invested <= sum) {
    exact = true;
    best = worst = assumed(places, ownerFp, holders, beyond);
  } else {
    // the list is newer and the sum grew by delta: unknown deposits, from the owner at best, from the strongest holder
    // at worst. Without rankings nothing is known about who holds what and the sum is 0: at best the owner paid it
    // all, at worst one player holds it all.
    const delta = b.invested - sum;
    best = assumed(places, ownerFp + delta, holders, beyond);
    worst = assumed(places, ownerFp, holders, beyond, delta);
  }

  const atBest = solve(best);
  const atWorst = exact ? atBest : solve(worst);
  const place = atBest ?? atWorst;
  if (!place) return 'none';
  const tier: SnipeTier = exact ? 'exact' : atWorst ? 'safe' : 'possible';
  // without a paying place in the worst case the range starts at nothing gained, or at the loss of the one place
  const low = atWorst?.profit ?? Math.min(0, place.profit);
  return {
    owner: b.owner,
    entityId: b.entityId,
    cityEntityId: b.cityEntityId,
    level: b.level,
    invested: b.invested,
    required: b.required,
    tier,
    place,
    ...(atWorst && !exact && { worst: atWorst }),
    profitLow: Math.min(low, place.profit),
    profitHigh: Math.max(low, place.profit),
    estimate: level.reward?.estimate ?? false,
    maybeLocked: b.invested === 0,
    seenAt: b.seenAt,
    ownerShare: ownerShare(b),
    ...(b.growth !== undefined && { growth: b.growth }),
  };
}

/** The whole list: hits by profit, the rest counted. */
export function snipeList(input: SnipeInput): SnipeList {
  const out: SnipeList = { hits: [], none: 0, ownContribution: 0, unknownReward: 0 };
  for (const b of input.buildings) {
    const r = snipeBuilding(b, input.greatBuilding(b.cityEntityId), input.arcBonus);
    if (r === 'none') out.none++;
    else if (r === 'ownContribution') out.ownContribution++;
    else if (r === 'unknownReward') out.unknownReward++;
    else out.hits.push(r);
  }
  out.hits.sort((a, b) => b.profitHigh - a.profitHigh || b.profitLow - a.profitLow);
  return out;
}

/** sorts by the best case, the worst case breaking ties */
export const snipeProfitKey = (h: SnipeHit) => h.profitHigh * 1e9 + h.profitLow;

/** the tiers from the best: exact over safe over possible, for sorting */
export const TIER_ORDER: Record<SnipeTier, number> = { exact: 2, safe: 1, possible: 0 };
